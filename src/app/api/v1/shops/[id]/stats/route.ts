import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey, logApiCall } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';

// GET /api/v1/shops/:id/stats — statistiky shopu
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authenticateApiKey(req);
  if (authResult instanceof NextResponse) return authResult;
  const { shop } = authResult;
  const { id } = await params;

  // Autorizace: API key musí patřit k danému shopu
  if (shop.id !== id) {
    return NextResponse.json({ error: 'Nemáte přístup k tomuto shopu.' }, { status: 403 });
  }

  const supabase = createServiceClient();

  // Všechny zásilky shopu
  const { data: allShipments } = await supabase
    .from('st_shipments')
    .select('status, verification_score, created_at, delivered_at')
    .eq('shop_id', id);

  const shipments = allShipments || [];

  const totalShipments = shipments.length;
  const delivered = shipments.filter(s => s.status === 'delivered').length;
  const inTransit = shipments.filter(s => s.status === 'in_transit' || s.status === 'out_for_delivery').length;
  const returned = shipments.filter(s => s.status === 'returned').length;
  const cancelled = shipments.filter(s => s.status === 'cancelled').length;

  // Průměrné skóre (jen zásilky se skóre > 0)
  const scored = shipments.filter(s => s.verification_score > 0);
  const averageScore = scored.length > 0
    ? Math.round(scored.reduce((sum, s) => sum + s.verification_score, 0) / scored.length)
    : 0;

  // Průměrná doba doručení
  const deliveredWithDates = shipments.filter(s => s.status === 'delivered' && s.delivered_at);
  let averageDeliveryDays = 0;
  if (deliveredWithDates.length > 0) {
    const totalDays = deliveredWithDates.reduce((sum, s) => {
      const created = new Date(s.created_at).getTime();
      const deliveredAt = new Date(s.delivered_at!).getTime();
      return sum + (deliveredAt - created) / (1000 * 60 * 60 * 24);
    }, 0);
    averageDeliveryDays = Math.round((totalDays / deliveredWithDates.length) * 10) / 10;
  }

  // Posledních 30 dní
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recent = shipments.filter(s => new Date(s.created_at) >= thirtyDaysAgo);
  const recentDelivered = recent.filter(s => s.status === 'delivered').length;
  const recentScored = recent.filter(s => s.verification_score > 0);
  const recentAvgScore = recentScored.length > 0
    ? Math.round(recentScored.reduce((sum, s) => sum + s.verification_score, 0) / recentScored.length)
    : 0;

  const stats = {
    total_shipments: totalShipments,
    delivered,
    in_transit: inTransit,
    returned,
    cancelled,
    average_score: averageScore,
    average_delivery_days: averageDeliveryDays,
    last_30_days: {
      shipments: recent.length,
      delivered: recentDelivered,
      average_score: recentAvgScore,
    },
  };

  await logApiCall(shop.id, `/api/v1/shops/${id}/stats`, 'GET', 200, null, stats, req.headers.get('x-forwarded-for'));

  return NextResponse.json(stats);
}
