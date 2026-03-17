import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey, logApiCall } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';
import { verifyShipment } from '@/lib/verification';
import type { Shipment } from '@/lib/types';

// GET /api/v1/shipments/:id — detail zásilky + verifikační report
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authenticateApiKey(req);
  if (authResult instanceof NextResponse) return authResult;
  const { shop } = authResult;
  const { id } = await params;

  const supabase = createServiceClient();

  // Zásilka
  const { data: shipment, error } = await supabase
    .from('st_shipments')
    .select('*')
    .eq('id', id)
    .eq('shop_id', shop.id)
    .single();

  if (error || !shipment) {
    return NextResponse.json({ error: 'Zásilka nenalezena.' }, { status: 404 });
  }

  // Tracking eventy
  const { data: events } = await supabase
    .from('st_tracking_events')
    .select('*')
    .eq('shipment_id', id)
    .order('timestamp', { ascending: false });

  // Verifikační výsledky
  const { data: verificationResults } = await supabase
    .from('st_verification_results')
    .select('*')
    .eq('shipment_id', id)
    .order('checked_at', { ascending: false });

  // Generovat verifikační report
  const report = verifyShipment(shipment as Shipment, null);

  await logApiCall(shop.id, `/api/v1/shipments/${id}`, 'GET', 200, null, { found: true }, req.headers.get('x-forwarded-for'));

  return NextResponse.json({
    shipment,
    events: events || [],
    verification: {
      results: verificationResults || [],
      report,
    },
  });
}
