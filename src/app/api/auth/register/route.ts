import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  try {
    const { email, password, shopName } = await req.json();

    if (!email || !password || !shopName) {
      return NextResponse.json({ error: 'Email, heslo a název shopu jsou povinné.' }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // Registrace uživatele
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (authError || !authData.user) {
      return NextResponse.json({ error: authError?.message || 'Registrace selhala.' }, { status: 400 });
    }

    // Vytvoření shopu (service role aby obešel RLS)
    const serviceClient = createServiceClient();
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
      session: authData.session,
      shop,
    }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Chyba serveru.' }, { status: 500 });
  }
}
