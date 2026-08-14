// Deploy via Supabase Dashboard → Edge Functions → Create function "send-push".
// Turn OFF "Verify JWT" (the DB webhook calls this with no Supabase auth header).
// Secrets needed (Edge Functions → Manage secrets), all from the Firebase service
// account JSON (Project settings → Service accounts → Generate new private key):
//   FIREBASE_PROJECT_ID    = the "project_id" field
//   FIREBASE_CLIENT_EMAIL  = the "client_email" field
//   FIREBASE_PRIVATE_KEY   = the "private_key" field, pasted as-is (with \n's — see below)
//
// Then wire it up: Database → Webhooks → Create a new webhook on table "messages",
// event INSERT, type "HTTP Request", pointing at this function's URL.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://kprfjlcydxqpcgwjzafw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_h-w7eAaBfmktfdRa1YG-sQ_Zqnxhhou';

const PROJECT_ID = Deno.env.get('FIREBASE_PROJECT_ID');
const CLIENT_EMAIL = Deno.env.get('FIREBASE_CLIENT_EMAIL');
const PRIVATE_KEY = (Deno.env.get('FIREBASE_PRIVATE_KEY') || '').replace(/\\n/g, '\n');

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const row = payload.record ?? payload.new;
    if (!row || row.author_phone === 'system') return new Response('ok');

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    const [{ data: members }, { data: chat }] = await Promise.all([
      supabase.from('chat_members').select('phone').eq('chat_id', row.chat_id).neq('phone', row.author_phone),
      supabase.from('chats').select('name, emoji').eq('id', row.chat_id).maybeSingle(),
    ]);
    if (!members || members.length === 0) return new Response('ok');

    const phones = members.map((m: { phone: string }) => m.phone);
    const { data: tokens } = await supabase.from('push_tokens').select('token').in('phone', phones);
    if (!tokens || tokens.length === 0) return new Response('ok');

    const accessToken = await getAccessToken();
    const title = `${chat?.emoji ?? ''} ${chat?.name ?? 'Кенты'}`.trim();
    const body = snippetOf(row);

    await Promise.all(
      tokens.map((t: { token: string }) =>
        fetch(`https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: {
              token: t.token,
              notification: { title: `${row.author_name}: ${title}`, body },
              data: { type: 'message', chatId: row.chat_id },
            },
          }),
        }).catch(() => {})
      )
    );

    return new Response('ok');
  } catch (e) {
    console.error('ERROR', e);
    return new Response('ok');
  }
});

function snippetOf(row: any) {
  if (row.text) return row.text.slice(0, 120);
  if (row.sticker) return `${row.sticker} стикер`;
  if (row.image) return '📷 Фото';
  if (row.audio) return '🎤 Голосовое';
  if (row.poll) return `📊 ${row.poll.question}`;
  return 'Новое сообщение';
}

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
  return data.access_token;
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem.replace('-----BEGIN PRIVATE KEY-----', '').replace('-----END PRIVATE KEY-----', '').replace(/\s/g, '');
  const raw = atob(b64);
  const buf = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
  return buf.buffer;
}
