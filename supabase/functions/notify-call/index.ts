// Deploy via Supabase Dashboard → Edge Functions → Create function "notify-call".
// Turn OFF "Verify JWT". Uses the same FIREBASE_* secrets already set for send-push.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://kprfjlcydxqpcgwjzafw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_h-w7eAaBfmktfdRa1YG-sQ_Zqnxhhou';

const PROJECT_ID = Deno.env.get('FIREBASE_PROJECT_ID');
const CLIENT_EMAIL = Deno.env.get('FIREBASE_CLIENT_EMAIL');
const PRIVATE_KEY = (Deno.env.get('FIREBASE_PRIVATE_KEY') || '').replace(/\\n/g, '\n');

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const { chatId, callerPhone, callerName, chatName, chatEmoji } = await req.json();
    console.log(`[notify-call] chatId=${chatId} callerPhone=${callerPhone}`);
    console.log(`[notify-call] secrets present: PROJECT_ID=${!!PROJECT_ID} CLIENT_EMAIL=${!!CLIENT_EMAIL} PRIVATE_KEY=${!!PRIVATE_KEY}`);
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    const { data: members, error: membersError } = await supabase
      .from('chat_members')
      .select('phone')
      .eq('chat_id', chatId)
      .neq('phone', callerPhone);
    if (membersError) console.error('[notify-call] chat_members query error', membersError);
    console.log(`[notify-call] members found: ${members?.length ?? 0}`, members);
    if (!members || members.length === 0) return new Response('ok', { headers: CORS });

    const phones = members.map((m: { phone: string }) => m.phone);
    const { data: tokens, error: tokensError } = await supabase.from('push_tokens').select('token').in('phone', phones);
    if (tokensError) console.error('[notify-call] push_tokens query error', tokensError);
    console.log(`[notify-call] tokens found: ${tokens?.length ?? 0}`);
    if (!tokens || tokens.length === 0) return new Response('ok', { headers: CORS });

    const accessToken = await getAccessToken();
    console.log(`[notify-call] got FCM access token: ${accessToken ? 'yes' : 'NO — this is the problem'}`);

    const results = await Promise.all(
      tokens.map((t: { token: string }) =>
        fetch(`https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: {
              token: t.token,
              // Data-only (no top-level "notification") so this always goes through
              // our own FirebaseMessagingService.onMessageReceived — including with the
              // app fully killed — instead of the OS auto-posting a plain tap-to-open
              // banner. That's what lets the native side build a real ringing call
              // notification with Accept/Decline actions.
              data: {
                type: 'call',
                chatId: String(chatId),
                callerName: callerName || 'Кто-то',
                chatName: chatName || 'Кенты',
                chatEmoji: chatEmoji || '📞',
              },
              android: { priority: 'high' },
            },
          }),
        })
          .then(async (r) => ({ status: r.status, body: await r.text() }))
          .catch((e) => ({ status: 'fetch-failed', body: String(e) }))
      )
    );
    console.log('[notify-call] FCM send results:', JSON.stringify(results));

    return new Response('ok', { headers: CORS });
  } catch (e) {
    console.error('[notify-call] fatal error', e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: CORS });
  }
});

async function getAccessToken(): Promise<string> {
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: CLIENT_EMAIL,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };
  const enc = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const unsigned = `${enc(header)}.${enc(claim)}`;

  const key = await crypto.subtle.importKey('pkcs8', pemToArrayBuffer(PRIVATE_KEY), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const jwt = `${unsigned}.${sigB64}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const data = await res.json();
  if (!data.access_token) console.error('[notify-call] oauth token request failed', res.status, data);
  return data.access_token;
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem.replace('-----BEGIN PRIVATE KEY-----', '').replace('-----END PRIVATE KEY-----', '').replace(/\s/g, '');
  const raw = atob(b64);
  const buf = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
  return buf.buffer;
}
