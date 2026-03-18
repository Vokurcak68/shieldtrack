import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey, logApiCall } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';

const VALID_SORT_FIELDS = ['created_at', 'updated_at', 'status', 'verification_score', 'tracking_number'];
const VALID_ORDERS = ['asc', 'desc'];

// GET /api/v1/shops/:id/shipments — zásilky shopu s filtrováním a stránkováním
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

  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  const carrier = url.searchParams.get('carrier');
  const search = url.searchParams.get('search');
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const limit = Math.min(Math.max(1, parseInt(url.searchParams.get('limit') || '20')), 100);
  const sort = VALID_SORT_FIELDS.includes(url.searchParams.get('sort') || '')
    ? url.searchParams.get('sort')!
    : 'created_at';
  const order = VALID_ORDERS.includes(url.searchParams.get('order') || '')
    ? url.searchParams.get('order')!
    : 'desc';

  const offset = (page - 1) * limit;
  const supabase = createServiceClient();

  let query = supabase
    .from('st_shipments')
    .select('*', { count: 'exact' })
    .eq('shop_id', id)
    .order(sort, { ascending: order === 'asc' })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq('status', status);
  if (carrier) query = query.eq('carrier', carrier);
  if (search) {
    query = query.or(`tracking_number.ilike.%${search}%,recipient_name.ilike.%${search}%,external_order_id.ilike.%${search}%`);
  }

  const { data: shipments, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: 'Chyba při načítání zásilek.', details: error.message }, { status: 500 });
  }

  const total = count || 0;
  const result = {
    shipments: shipments || [],
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };

  await logApiCall(shop.id, `/api/v1/shops/${id}/shipments`, 'GET', 200, null, { total }, req.headers.get('x-forwarded-for'));

  return NextResponse.json(result);
}
