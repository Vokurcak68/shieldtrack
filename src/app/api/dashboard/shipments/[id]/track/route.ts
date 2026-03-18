import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase-server';
import { getAdapter } from '@/lib/carriers';
import { verifyShipment } from '@/lib/verification';
import type { Shipment, Carrier } from '@/lib/types';

// POST /api/dashboard/shipments/[id]/track — manuální trigger tracking kontroly
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Ověření uživatele
  const authHeader = req.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');

  if (!token) {
    return NextResponse.json({ error: 'Nepřihlášený uživatel.' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: 'Neplatná session.' }, { status: 401 });
  }

  const serviceClient = createServiceClient();

  // Ověřit, že zásilka patří uživatelovu shopu
  const { data: shop } = await serviceClient
    .from('st_shops')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .limit(1)
    .single();

  if (!shop) {
    return NextResponse.json({ error: 'Shop nenalezen.' }, { status: 404 });
  }

  const { data: shipment } = await serviceClient
    .from('st_shipments')
    .select('*')
    .eq('id', id)
    .eq('shop_id', shop.id)
    .single();

  if (!shipment) {
    return NextResponse.json({ error: 'Zásilka nenalezena.' }, { status: 404 });
  }

  const typedShipment = shipment as Shipment;

  // Zkusit tracking
  const adapter = getAdapter(typedShipment.carrier as Carrier);
  if (!adapter) {
    // Aktualizovat last_checked_at i bez adaptéru
    await serviceClient
      .from('st_shipments')
      .update({ last_checked_at: new Date().toISOString() })
      .eq('id', id);

    return NextResponse.json({
      message: 'Pro tohoto přepravce není dostupný tracking adaptér.',
      shipment: { ...typedShipment, last_checked_at: new Date().toISOString() },
    });
  }

  try {
    const trackingResult = await adapter.track(typedShipment.tracking_number);

    const updates: Record<string, unknown> = {
      last_checked_at: new Date().toISOString(),
      carrier_status_raw: trackingResult.carrierStatusRaw,
    };

    if (trackingResult.found && trackingResult.status !== typedShipment.status) {
      updates.status = trackingResult.status;
      if (trackingResult.status === 'delivered') {
        updates.delivered_at = new Date().toISOString();
      }
    }

    // Verifikace
    const report = verifyShipment(typedShipment, trackingResult);
    updates.verification_score = report.score;
    updates.verification_details = {
      status: report.status,
      summary: report.summary,
      lastChecked: new Date().toISOString(),
    };

    // Uložit aktualizace zásilky
    const { data: updated } = await serviceClient
      .from('st_shipments')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    // Tracking eventy
    if (trackingResult.events.length > 0) {
      const events = trackingResult.events.map(e => ({
        shipment_id: id,
        status: e.status,
        description: e.description,
        location: e.location || null,
        timestamp: e.timestamp,
        raw_data: {},
      }));

      await serviceClient
        .from('st_tracking_events')
        .delete()
        .eq('shipment_id', id);

      await serviceClient
        .from('st_tracking_events')
        .insert(events);
    }

    // Verifikační výsledky
    const verResults = report.checks.map(c => ({
      shipment_id: id,
      check_type: c.type,
      result: c.result,
      details: c.details,
      checked_at: new Date().toISOString(),
    }));

    await serviceClient
      .from('st_verification_results')
      .delete()
      .eq('shipment_id', id);

    await serviceClient
      .from('st_verification_results')
      .insert(verResults);

    return NextResponse.json({
      message: 'Kontrola dokončena.',
      shipment: updated,
      verification: {
        score: report.score,
        status: report.status,
        summary: report.summary,
      },
    });
  } catch (err) {
    console.error(`Manual track error for shipment ${id}:`, err);
    return NextResponse.json(
      { error: 'Chyba při kontrole zásilky.' },
      { status: 500 }
    );
  }
}
