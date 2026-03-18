import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase-server';
import { detectCarrier } from '@/lib/carriers';

/**
 * Pomocná funkce: ověření session uživatele přes anon key
 * a vrácení shop_id.
 */
async function getShopFromSession(req: NextRequest) {
  // Přečteme auth token z cookie nebo Authorization headeru
  const authHeader = req.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');

  if (!token) {
    return { error: 'Nepřihlášený uživatel.', status: 401 };
  }

  // Ověříme token přes Supabase
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return { error: 'Neplatná session.', status: 401 };
  }

  // Najdeme shop uživatele
  const serviceClient = createServiceClient();
  const { data: shop, error: shopError } = await serviceClient
    .from('st_shops')
    .select('id, api_key')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .limit(1)
    .single();

  if (shopError || !shop) {
    return { error: 'Shop nenalezen.', status: 404 };
  }

  return { shop };
}

// POST /api/dashboard/shipments — vytvoření zásilky přes session auth
export async function POST(req: NextRequest) {
  const result = await getShopFromSession(req);

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const { shop } = result;

  try {
    const body = await req.json();
    const {
      tracking_number,
      carrier: carrierInput,
      recipient_name,
      recipient_city,
      recipient_zip,
      recipient_address,
      external_order_id,
    } = body;

    if (!tracking_number || !tracking_number.trim()) {
      return NextResponse.json(
        { error: 'Tracking číslo je povinné.' },
        { status: 400 }
      );
    }

    // Přepravce: buď vybraný uživatelem, nebo auto-detekce
    const carrier = carrierInput || detectCarrier(tracking_number.trim());

    const supabase = createServiceClient();
    const { data: shipment, error } = await supabase
      .from('st_shipments')
      .insert({
        shop_id: shop.id,
        tracking_number: tracking_number.trim(),
        carrier,
        recipient_name: recipient_name || null,
        recipient_city: recipient_city || null,
        recipient_zip: recipient_zip || null,
        recipient_address: recipient_address || null,
        external_order_id: external_order_id || null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: 'Nepodařilo se vytvořit zásilku.', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ shipment }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: 'Neplatný request body.' },
      { status: 400 }
    );
  }
}
