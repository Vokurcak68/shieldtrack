import { createHmac } from 'crypto';
import { createServiceClient } from './supabase-server';

export type WebhookEvent = 'shipment.created' | 'shipment.updated' | 'shipment.verified';

interface WebhookPayload {
  event: WebhookEvent;
  timestamp: string;
  data: {
    id: string;
    tracking_number: string;
    carrier: string;
    status: string;
    verification_score: number;
    verification_details: Record<string, unknown>;
    [key: string]: unknown;
  };
}

interface Webhook {
  id: string;
  shop_id: string;
  url: string;
  events: string[];
  is_active: boolean;
}

const RETRY_DELAYS = [1000, 5000, 15000]; // 1s, 5s, 15s
const REQUEST_TIMEOUT = 10_000; // 10s

function signPayload(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function deliverWebhook(
  webhook: Webhook,
  payload: WebhookPayload,
  secret: string
): Promise<{ success: boolean; statusCode: number | null; responseBody: string; attempts: number }> {
  const body = JSON.stringify(payload);
  const signature = signPayload(body, secret);

  let lastStatusCode: number | null = null;
  let lastResponseBody = '';

  for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt++) {
    try {
      const response = await fetchWithTimeout(
        webhook.url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-ShieldTrack-Signature': signature,
            'X-ShieldTrack-Event': payload.event,
          },
          body,
        },
        REQUEST_TIMEOUT
      );

      lastStatusCode = response.status;
      lastResponseBody = await response.text().catch(() => '');

      if (response.ok) {
        return { success: true, statusCode: lastStatusCode, responseBody: lastResponseBody, attempts: attempt + 1 };
      }
    } catch (err) {
      lastResponseBody = err instanceof Error ? err.message : 'Unknown error';
    }

    // Čekej před dalším pokusem (kromě posledního)
    if (attempt < RETRY_DELAYS.length - 1) {
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[attempt]));
    }
  }

  return { success: false, statusCode: lastStatusCode, responseBody: lastResponseBody, attempts: RETRY_DELAYS.length };
}

/**
 * Odešle webhooky pro daný shop a event. Fire-and-forget — neblokuje volající.
 */
export function sendWebhooks(shopId: string, event: WebhookEvent, data: WebhookPayload['data']): void {
  // Fire-and-forget — nečekáme na výsledek
  sendWebhooksAsync(shopId, event, data).catch(err => {
    console.error(`[webhook-sender] Error sending webhooks for shop ${shopId}:`, err);
  });
}

async function sendWebhooksAsync(
  shopId: string,
  event: WebhookEvent,
  data: WebhookPayload['data']
): Promise<void> {
  const supabase = createServiceClient();

  // Načti webhooky pro shop
  const { data: webhooks, error: webhooksError } = await supabase
    .from('st_webhooks')
    .select('*')
    .eq('shop_id', shopId)
    .eq('is_active', true);

  if (webhooksError || !webhooks || webhooks.length === 0) {
    // Fallback: zkus webhook_url přímo na shopu (zpětná kompatibilita)
    const { data: shop } = await supabase
      .from('st_shops')
      .select('webhook_url, api_secret')
      .eq('id', shopId)
      .single();

    if (!shop?.webhook_url) return;

    const payload: WebhookPayload = {
      event,
      timestamp: new Date().toISOString(),
      data,
    };

    const result = await deliverWebhook(
      { id: 'legacy', shop_id: shopId, url: shop.webhook_url, events: [], is_active: true },
      payload,
      shop.api_secret
    );

    console.log(`[webhook-sender] Legacy webhook ${shop.webhook_url}: ${result.success ? 'OK' : 'FAIL'} (${result.attempts} attempts)`);
    return;
  }

  // Načti shop secret pro podpis
  const { data: shop } = await supabase
    .from('st_shops')
    .select('api_secret')
    .eq('id', shopId)
    .single();

  if (!shop?.api_secret) {
    console.error(`[webhook-sender] No api_secret found for shop ${shopId}`);
    return;
  }

  const payload: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    data,
  };

  // Odešli na všechny aktivní webhooky, které mají tento event
  const deliveries = (webhooks as Webhook[])
    .filter(w => w.events.includes(event))
    .map(async (webhook) => {
      const result = await deliverWebhook(webhook, payload, shop.api_secret);

      // Loguj do st_webhook_logs
      try {
        await supabase.from('st_webhook_logs').insert({
          webhook_id: webhook.id,
          event,
          payload,
          status_code: result.statusCode,
          response_body: result.responseBody?.substring(0, 2000) || null,
          success: result.success,
          attempts: result.attempts,
        });
      } catch (logErr) {
        console.error(`[webhook-sender] Failed to log webhook delivery:`, logErr);
      }

      return result;
    });

  await Promise.allSettled(deliveries);
}
