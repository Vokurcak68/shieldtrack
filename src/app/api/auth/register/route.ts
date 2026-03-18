import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  try {
    const { email, password, shopName } = await req.json();

    if (!email || !password || !shopName) {
      return NextResponse.json({ error: 'Email, heslo a název shopu jsou povinné.' }, { status: 400 });
    }

    const serviceClient = createServiceClient();

    // Registrace uživatele (service role = auto-confirm email)
    const { data: authData, error: authError } = await serviceClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError || !authData.user) {
      return NextResponse.json({ error: authError?.message || 'Registrace selhala.' }, { status: 400 });
    }

    // Vytvoření shopu
    const { data: shop, error: shopError } = await serviceClient
      .from('st_shops')
      .insert({
        user_id: authData.user.id,
        name: shopName,
      })
      .select()
      .single();

    if (shopError) {
      return NextResponse.json({ error: 'Nepodařilo se vytvořit shop.' }, { status: 500 });
    }

    return NextResponse.json({
      user: authData.user,
      shop,
      message: 'Účet vytvořen. Přihlaste se.',
    }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Chyba serveru.' }, { status: 500 });
  }
}
