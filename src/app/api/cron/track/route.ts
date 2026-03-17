import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getAdapter } from '@/lib/carriers';
import { verifyShipment } from '@/lib/verification';
import type { Shipment, Carrier } from '@/lib/types';

// GET /api/cron/track — periodická kontrola zásilek
export async function GET(req: NextRequest) {
  // Ověření cron secret (Vercel cron nebo manuální volání)
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Načti zásilky, které je třeba zkontrolovat
  const { data: shipments, error } = await supabase
    .from('st_shipments')
    .select('*')
    .not('status', 'in', '("delivered","returned","cancelled")')
    .order('last_checked_at', { ascending: true, nullsFirst: true })
    .limit(50);

  if (error || !shipments) {
    return NextResponse.json({ error: 'Chyba při načítání zásilek.', details: error?.message }, { status: 500 });
  }

  const results = {
    checked: 0,
    updated: 0,
    errors: 0,
    webhooksSent: 0,
  };

  for (const shipment of shipments as Shipment[]) {
    try {
      const adapter = getAdapter(shipment.carrier as Carrier);
      if (!adapter) {
        // Přepravce bez adaptéru — jen aktualizuj last_checked_at
        await supabase
          .from('st_shipments')
          .update({ last_checked_at: new Date().toISOString() })
          .eq('id', shipment.id);
        results.checked++;
        continue;
      }

      // Trackuj zásilku
      const trackingResult = await adapter.track(shipment.tracking_number);
      results.checked++;

      const oldStatus = shipment.status;
      const updates: Record<string, unknown> = {
        last_checked_at: new Date().toISOString(),
        carrier_status_raw: trackingResult.carrierStatusRaw,
      };

      // Aktualizuj status pokud se změnil
      if (trackingResult.found && trackingResult.status !== shipment.status) {
        updates.status = trackingResult.status;
        if (trackingResult.status === 'delivered') {
          updates.delivered_at = new Date().toISOString();
        }
      }

      // Spusť verifikaci
      const report = verifyShipment(shipment, trackingResult);
      updates.verification_score = report.score;
      updates.verification_details = {
        status: report.status,
        summary: report.summary,
        lastChecked: new Date().toISOString(),
      };

      // Ulož aktualizace
      await supabase
        .from('st_shipments')
        .update(updates)
        .eq('id', shipment.id);

      // Ulož tracking eventy
      if (trackingResult.events.length > 0) {
        const events = trackingResult.events.map(e => ({
          shipment_id: shipment.id,
          status: e.status,
          description: e.description,
          location: e.location || null,
          timestamp: e.timestamp,
          raw_data: {},
        }));

        // Smaž staré eventy a vlož nové
        await supabase
          .from('st_tracking_events')
          .delete()
          .eq('shipment_id', shipment.id);

        await supabase
          .from('st_tracking_events')
          .insert(events);
      }

      // Ulož verifikační výsledky
      const verResults = report.checks.map(c => ({
        shipment_id: shipment.id,
        check_type: c.type,
        result: c.result,
        details: c.details,
        checked_at: new Date().toISOString(),
      }));

      await supabase
        .from('st_verification_results')
        .delete()
        .eq('shipment_id', shipment.id);

      await supabase
        .from('st_verification_results')
        .insert(verResults);

      // Webhook pokud se status změnil
      if (updates.status && updates.status !== oldStatus) {
        results.updated++;
        await sendWebhook(supabase, shipment, updates.status as string, report);
        results.webhooksSent++;
      }
    } catch (err) {
      console.error(`Error tracking shipment ${shipment.id}:`, err);
      results.errors++;
    }
  }

  return NextResponse.json({
    success: true,
    ...results,
    timestamp: new Date().toISOString(),
  });
}

async function sendWebhook(
  supabase: ReturnType<typeof createServiceClient>,
  shipment: Shipment,
  newStatus: string,
  report: { score: number; status: string; summary: string }
) {
  try {
    const { data: shop } = await supabase
      .from('st_shops')
      .select('webhook_url')
      .eq('id', shipment.shop_id)
      .single();

    if (!shop?.webhook_url) return;

    await fetch(shop.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'shipment.status_changed',
        shipment_id: shipment.id,
        tracking_number: shipment.tracking_number,
        old_status: shipment.status,
        new_status: newStatus,
        verification_score: report.score,
        verification_status: report.status,
        timestamp: new Date().toISOString(),
      }),
    });
  } catch (err) {
    console.error('Webhook send error:', err);
  }
}
