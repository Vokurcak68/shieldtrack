import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from './supabase-server';
import type { Shop } from './types';

interface AuthResult {
  shop: Shop;
}

/**
 * Autentizace API requestu přes X-Api-Key header.
 * Vrací shop nebo NextResponse s chybou.
 */
export async function authenticateApiKey(
  req: NextRequest
): Promise<AuthResult | NextResponse> {
  const apiKey = req.headers.get('X-Api-Key');

  if (!apiKey) {
    return NextResponse.json(
      { error: 'Chybí API klíč. Pošlete ho v headeru X-Api-Key.' },
      { status: 401 }
    );
  }

  const supabase = createServiceClient();
  const { data: shop, error } = await supabase
    .from('st_shops')
    .select('*')
    .eq('api_key', apiKey)
    .eq('is_active', true)
    .single();

  if (error || !shop) {
    return NextResponse.json(
      { error: 'Neplatný API klíč.' },
      { status: 401 }
    );
  }

  return { shop: shop as Shop };
}

/**
 * Logování API requestu.
 */
export async function logApiCall(
  shopId: string | null,
  endpoint: string,
  method: string,
  statusCode: number,
  requestBody: unknown,
  responseBody: unknown,
  ip: string | null
) {
  try {
    const supabase = createServiceClient();
    await supabase.from('st_api_logs').insert({
      shop_id: shopId,
      endpoint,
      method,
      status_code: statusCode,
      request_body: requestBody,
      response_body: responseBody,
      ip,
    });
  } catch {
    console.error('Failed to log API call');
  }
}
