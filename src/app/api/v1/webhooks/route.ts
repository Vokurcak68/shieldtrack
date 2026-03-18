import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey, logApiCall } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';

const VALID_EVENTS = ['shipment.created', 'shipment.updated', 'shipment.verified'];

// POST /api/v1/webhooks — registrace webhooku
export async function POST(req: NextRequest) {
  const authResult = await authenticateApiKey(req);
  if (authResult instanceof NextResponse) return authResult;
  const { shop } = authResult;

  try {
    const body = await req.json();
    const { url, events } = body;

    if (!url) {
      return NextResponse.json({ error: 'url je povinné.' }, { status: 400 });
    }

    // Validace URL
    try {
      new URL(url);
    } catch {
      return NextResponse.json({ error: 'Neplatná URL adresa.' }, { status: 400 });
    }

    // Validace eventů
    const webhookEvents = events && Array.isArray(events) ? events : VALID_EVENTS;
    const invalidEvents = webhookEvents.filter((e: string) => !VALID_EVENTS.includes(e));
    if (invalidEvents.length > 0) {
      return NextResponse.json(
        { error: `Neplatné eventy: ${invalidEvents.join(', ')}. Povolené: ${VALID_EVENTS.join(', ')}` },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();
    const { data: webhook, error } = await supabase
      .from('st_webhooks')
      .insert({
        shop_id: shop.id,
        url,
        events: webhookEvents,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: 'Nepodařilo se vytvořit webhook.', details: error.message }, { status: 500 });
    }

    // Zpětná kompatibilita: aktualizuj webhook_url na shopu
    await supabase
      .from('st_shops')
      .update({ webhook_url: url })
      .eq('id', shop.id);

    await logApiCall(shop.id, '/api/v1/webhooks', 'POST', 201, body, { webhook_id: webhook.id }, req.headers.get('x-forwarded-for'));

    return NextResponse.json({ webhook }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Neplatný request body.' }, { status: 400 });
  }
}

// GET /api/v1/webhooks — seznam webhooků
export async function GET(req: NextRequest) {
  const authResult = await authenticateApiKey(req);
  if (authResult instanceof NextResponse) return authResult;
  const { shop } = authResult;

  const supabase = createServiceClient();
  const { data: webhooks, error } = await supabase
    .from('st_webhooks')
    .select('*')
    .eq('shop_id', shop.id)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: 'Chyba při načítání webhooků.' }, { status: 500 });
  }

  return NextResponse.json({ webhooks: webhooks || [] });
}

// DELETE /api/v1/webhooks — smazání webhooku
export async function DELETE(req: NextRequest) {
  const authResult = await authenticateApiKey(req);
  if (authResult instanceof NextResponse) return authResult;
  const { shop } = authResult;

  const url = new URL(req.url);
  const webhookId = url.searchParams.get('id');

  if (!webhookId) {
    return NextResponse.json({ error: 'Chybí webhook id.' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from('st_webhooks')
    .delete()
    .eq('id', webhookId)
    .eq('shop_id', shop.id);

  if (error) {
    return NextResponse.json({ error: 'Nepodařilo se smazat webhook.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
