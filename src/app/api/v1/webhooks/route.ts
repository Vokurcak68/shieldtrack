import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey, logApiCall } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';

// POST /api/v1/webhooks — registrace webhook URL
export async function POST(req: NextRequest) {
  const authResult = await authenticateApiKey(req);
  if (authResult instanceof NextResponse) return authResult;
  const { shop } = authResult;

  try {
    const body = await req.json();
    const { webhook_url } = body;

    if (!webhook_url) {
      return NextResponse.json({ error: 'webhook_url je povinné.' }, { status: 400 });
    }

    // Validace URL
    try {
      new URL(webhook_url);
    } catch {
      return NextResponse.json({ error: 'Neplatná URL adresa.' }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { error } = await supabase
      .from('st_shops')
      .update({ webhook_url })
      .eq('id', shop.id);

    if (error) {
      return NextResponse.json({ error: 'Nepodařilo se uložit webhook.' }, { status: 500 });
    }

    await logApiCall(shop.id, '/api/v1/webhooks', 'POST', 200, body, { success: true }, req.headers.get('x-forwarded-for'));

    return NextResponse.json({ success: true, webhook_url });
  } catch {
    return NextResponse.json({ error: 'Neplatný request body.' }, { status: 400 });
  }
}
