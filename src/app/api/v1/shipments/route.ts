import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey, logApiCall } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';
import { detectCarrier } from '@/lib/carriers';

// POST /api/v1/shipments — registrace zásilky
export async function POST(req: NextRequest) {
  const authResult = await authenticateApiKey(req);
  if (authResult instanceof NextResponse) return authResult;
  const { shop } = authResult;

  try {
    const body = await req.json();
    const { tracking_number, recipient_name, recipient_city, recipient_zip, recipient_address, external_order_id, sender_name, sender_address } = body;

    if (!tracking_number) {
      const res = NextResponse.json({ error: 'Tracking číslo je povinné.' }, { status: 400 });
      await logApiCall(shop.id, '/api/v1/shipments', 'POST', 400, body, { error: 'missing tracking_number' }, req.headers.get('x-forwarded-for'));
      return res;
    }

    const carrier = detectCarrier(tracking_number);
    const supabase = createServiceClient();

    const { data: shipment, error } = await supabase
      .from('st_shipments')
      .insert({
        shop_id: shop.id,
        tracking_number: tracking_number.trim(),
        carrier,
        recipient_name,
        recipient_city,
        recipient_zip,
        recipient_address,
        external_order_id,
        sender_name,
        sender_address,
      })
      .select()
      .single();

    if (error) {
      const res = NextResponse.json({ error: 'Nepodařilo se vytvořit zásilku.', details: error.message }, { status: 500 });
      await logApiCall(shop.id, '/api/v1/shipments', 'POST', 500, body, { error: error.message }, req.headers.get('x-forwarded-for'));
      return res;
    }

    const res = NextResponse.json({ shipment }, { status: 201 });
    await logApiCall(shop.id, '/api/v1/shipments', 'POST', 201, body, { shipment_id: shipment.id }, req.headers.get('x-forwarded-for'));
    return res;
  } catch {
    return NextResponse.json({ error: 'Neplatný request body.' }, { status: 400 });
  }
}

// GET /api/v1/shipments — seznam zásilek
export async function GET(req: NextRequest) {
  const authResult = await authenticateApiKey(req);
  if (authResult instanceof NextResponse) return authResult;
  const { shop } = authResult;

  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  const carrier = url.searchParams.get('carrier');
  const search = url.searchParams.get('search');
  const dateFrom = url.searchParams.get('date_from');
  const dateTo = url.searchParams.get('date_to');
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
  const offset = (page - 1) * limit;

  const supabase = createServiceClient();
  let query = supabase
    .from('st_shipments')
    .select('*', { count: 'exact' })
    .eq('shop_id', shop.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq('status', status);
  if (carrier) query = query.eq('carrier', carrier);
  if (dateFrom) query = query.gte('created_at', dateFrom);
  if (dateTo) query = query.lte('created_at', dateTo);
  if (search) {
    query = query.or(`tracking_number.ilike.%${search}%,recipient_name.ilike.%${search}%,external_order_id.ilike.%${search}%`);
  }

  const { data: shipments, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: 'Chyba při načítání zásilek.' }, { status: 500 });
  }

  await logApiCall(shop.id, '/api/v1/shipments', 'GET', 200, null, { count }, req.headers.get('x-forwarded-for'));

  return NextResponse.json({
    shipments,
    pagination: {
      page,
      limit,
      total: count || 0,
      totalPages: Math.ceil((count || 0) / limit),
    },
  });
}
