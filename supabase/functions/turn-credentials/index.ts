Deno.serve(async (req) => {
  const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const domain = 'kenty-turn.metered.live';
  const key = Deno.env.get('METERED_SECRET_KEY') || '';
  const url = 'https://' + domain + '/api/v1/turn/credentials?apiKey=' + key;
  try {
    const res = await fetch(url);
    const text = await res.text();
    return new Response(text, { headers: Object.assign({}, CORS, { 'Content-Type': 'application/json' }) });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e && e.message) || e) }), { status: 500, headers: CORS });
  }
});
