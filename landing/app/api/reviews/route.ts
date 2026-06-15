import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const turnstileSecretKey = process.env.TURNSTILE_SECRET_KEY || '1x0000000000000000000000000000000AA'; // Standard Cloudflare test secret key (always passes)

let supabaseInstance: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (!supabaseInstance) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Supabase URL and Anon Key must be configured.');
    }
    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
  }
  return supabaseInstance;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, rating, comment, role_title, turnstileToken } = body;

    if (!name || !rating || !comment || !turnstileToken) {
      return NextResponse.json(
        { error: 'Name, rating, comment, and captcha verification are required.' },
        { status: 400 }
      );
    }

    // Debug logs for environment variables and tokens
    console.log('[Turnstile Debug] Secret Key Length:', turnstileSecretKey ? turnstileSecretKey.length : 0);
    console.log('[Turnstile Debug] Secret Key Masked:', turnstileSecretKey ? `${turnstileSecretKey.slice(0, 8)}...${turnstileSecretKey.slice(-4)}` : 'undefined');
    console.log('[Turnstile Debug] Token Length:', turnstileToken ? turnstileToken.length : 0);

    // Verify Cloudflare Turnstile token using standard form-urlencoded POST
    const verificationUrl = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
    const response = await fetch(verificationUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        secret: turnstileSecretKey,
        response: turnstileToken,
      }).toString(),
    });

    const verificationResult = await response.json();
    if (!verificationResult.success) {
      console.warn('[Turnstile] Verification failed:', JSON.stringify(verificationResult));
      return NextResponse.json(
        { error: `Captcha validation failed. Error: ${JSON.stringify(verificationResult['error-codes'] || verificationResult)}` },
        { status: 400 }
      );
    }

    // Insert reviews into Supabase
    const { error } = await (getSupabase()
      .from('reviews') as any)
      .insert({
        name,
        role_title: role_title || null,
        rating: Number(rating),
        comment,
        status: 'pending', // Forced to pending moderation
      });

    if (error) {
      console.error('[Reviews API] Supabase insert error:', error);
      return NextResponse.json(
        { error: 'Failed to submit review. Please try again.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[Reviews API] POST server error:', err);
    return NextResponse.json(
      { error: 'An unexpected server error occurred.' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const { data, error } = await (getSupabase()
      .from('reviews') as any)
      .select('*')
      .eq('status', 'approved')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Reviews API] Fetch error:', error);
      return NextResponse.json(
        { error: 'Failed to load reviews.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error('[Reviews API] GET server error:', err);
    return NextResponse.json(
      { error: 'An unexpected server error occurred.' },
      { status: 500 }
    );
  }
}
