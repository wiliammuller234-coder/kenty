// Deploy via Supabase Dashboard → Edge Functions → verify-code. Turn OFF "Verify JWT
// with legacy secret" (the client calls this before it has any session).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically — no manual
// secrets needed for this version.
//
// Why this exists: checkPendingCode() used to run entirely on the client, reading the
// `pending_codes` row (including the plaintext code) with the public key — since that
// table's RLS allowed public SELECT, anyone could read anyone's login code directly,
// no Telegram bot needed, and "verification" never actually gated anything
// server-side. This moves the comparison server-side (service role, table no longer
// publicly readable) and, on success, uses the Supabase Admin API to mint a REAL
// session for that phone — properly signed by Supabase itself, not a token we forge —
// which the client redeems via auth.verifyOtp() and which is what the new RLS
// policies check (auth.jwt() ->> 'phone') instead of trusting whatever phone a
// request claims to be.
//
// (An earlier version of this function hand-signed its own JWT with the project's
// "Legacy JWT Secret" — that stopped being accepted once this project's signing keys
// were rotated to the newer asymmetric (ECC) format, since a self-signed HS256 token
// no longer matches any key Supabase's gateway will verify against. Bridging through
// Supabase's own Admin API instead sidesteps that entirely — it's Supabase issuing
// the token, not us.)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };

// Real email auth is never used — Telegram is the actual verification channel — but
// admin.generateLink() is built around email magic links, so every phone gets a
// synthetic, never-delivered-to address purely so that machinery can issue a session.
function syntheticEmail(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, '');
  return `phone-${digits}@kenty.internal`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const { token, code, phone } = await req.json();
    if (!token || !code || !phone) {
      return new Response(JSON.stringify({ ok: false, error: 'missing fields' }), { status: 400, headers: CORS });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data } = await supabase.from('pending_codes').select('code, phone').eq('token', token).maybeSingle();

    if (!data || data.code !== code || data.phone !== phone) {
      return new Response(JSON.stringify({ ok: false }), { headers: CORS });
    }

    // One-time use — delete so the same code/token can't be replayed later.
    await supabase.from('pending_codes').delete().eq('token', token);

    const email = syntheticEmail(phone);

    // Get-or-create the underlying auth user for this phone. createUser fails with a
    // 422/"already registered" for a returning user — that's expected, not an error.
    const created = await supabase.auth.admin.createUser({
      email,
      phone,
      email_confirm: true,
      phone_confirm: true,
      user_metadata: { phone },
    });
    if (created.error && !String(created.error.message).toLowerCase().includes('already')) {
      console.error('[verify-code] createUser failed', created.error);
      return new Response(JSON.stringify({ ok: false, error: 'account setup failed' }), { status: 500, headers: CORS });
    }

    const link = await supabase.auth.admin.generateLink({ type: 'magiclink', email });
    if (link.error || !link.data?.properties?.hashed_token) {
      console.error('[verify-code] generateLink failed', link.error);
      return new Response(JSON.stringify({ ok: false, error: 'session setup failed' }), { status: 500, headers: CORS });
    }

    return new Response(
      JSON.stringify({ ok: true, email, hashedToken: link.data.properties.hashed_token }),
      { headers: CORS }
    );
  } catch (e) {
    console.error('[verify-code] fatal error', e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: CORS });
  }
});
