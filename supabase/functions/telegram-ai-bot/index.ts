// Deploy: supabase functions deploy telegram-ai-bot --no-verify-jwt
// Secrets needed (Edge Functions → Manage secrets):
//   AI_BOT_TOKEN    = token from @BotFather for THIS bot (not TELEGRAM_BOT_TOKEN —
//                     that name is already used by telegram-webhook for login codes)
//   OPENAI_API_KEY  = OpenAI API key
// After deploy, point this bot's webhook at the function URL (run once, replace
// <TOKEN> and <FUNCTION_URL> yourself — don't paste the token back into chat):
//   curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=<FUNCTION_URL>"
const AI_BOT_TOKEN = Deno.env.get('AI_BOT_TOKEN');
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');

Deno.serve(async (req) => {
  try {
    const update = await req.json();
    const message = update.message;
    if (!message?.text) return new Response('ok');

    const chatId = message.chat.id;

    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: message.text }],
      }),
    });
    const aiData = await aiRes.json();
    const reply: string = aiData.choices?.[0]?.message?.content ?? 'Не смог ответить, попробуй ещё раз.';

    await fetch(`https://api.telegram.org/bot${AI_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: reply }),
    });

    return new Response('ok');
  } catch (e) {
    console.error('ERROR', e);
    return new Response('ok');
  }
});
