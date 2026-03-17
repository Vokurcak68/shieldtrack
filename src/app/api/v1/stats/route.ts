import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey, logApiCall } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';

// GET /api/v1/stats — statistiky shopu
export async function GET(req: NextRequest) {
  const authResult = await authenticateApiKey(req);
  if (authResult instanceof NextResponse) return authResult;
  const { shop } = authResult;

  const supabase = createServiceClient();

  // Celkový počet zásilek
  const { count: totalShipments } = await supabase
    .from('st_shipments')
    .select('*', { count: 'exact', head: true })
    .eq('shop_id', shop.id);

  // Průměrné verifikační skóre
  const { data: avgData } = await supabase
    .from('st_shipments')
    .select('verification_score')
    .eq('shop_id', shop.id)
    .gt('verification_score', 0);

  const avgScore = avgData && avgData.length > 0
    ? Math.round(avgData.reduce((sum, s) => sum + (s.verification_score || 0), 0) / avgData.length)
    : 0;

  // Doručené zásilky
  const { count: deliveredCount } = await supabase
    .from('st_shipments')
    .select('*', { count: 'exact', head: true })
    .eq('shop_id', shop.id)
    .eq('status', 'delivered');

  const deliveredPercent = totalShipments && totalShipments > 0
    ? Math.round(((deliveredCount || 0) / totalShipments) * 100)
    : 0;

  // Průměrná doba doručení (dny)
  const { data: deliveredShipments } = await supabase
    .from('st_shipments')
    .select('created_at, delivered_at')
    .eq('shop_id', shop.id)
    .eq('status', 'delivered')
    .not('delivered_at', 'is', null);

  let avgDeliveryDays = 0;
  if (deliveredShipments && deliveredShipments.length > 0) {
    const totalDays = deliveredShipments.reduce((sum, s) => {
      const created = new Date(s.created_at).getTime();
      const delivered = new Date(s.delivered_at!).getTime();
      return sum + (delivered - created) / (1000 * 60 * 60 * 24);
    }, 0);
    avgDeliveryDays = Math.round((totalDays / deliveredShipments.length) * 10) / 10;
  }

  const stats = {
    totalShipments: totalShipments || 0,
    avgScore,
    deliveredPercent,
    avgDeliveryDays,
  };

  await logApiCall(shop.id, '/api/v1/stats', 'GET', 200, null, stats, req.headers.get('x-forwarded-for'));

  return NextResponse.json(stats);
}
