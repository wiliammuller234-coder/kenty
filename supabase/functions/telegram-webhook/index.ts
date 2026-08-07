// Deploy this via Supabase Dashboard → Edge Functions → Create function "telegram-webhook".
// Paste this code, turn OFF "Verify JWT" (Telegram calls this with no auth header),
// then add a secret TELEGRAM_BOT_TOKEN with the bot token from @BotFather.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://kprfjlcydxqpcgwjzafw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_h-w7eAaBfmktfdRa1YG-sQ_Zqnxhhou';
const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');

Deno.serve(async (req) => {
  try {
    console.log('BOT_TOKEN present:', !!BOT_TOKEN);
    const update = await req.json();
    console.log('update:', JSON.stringify(update));
    const msg = update.message;
    if (!msg || !msg.text) {
      console.log('no message/text in update');
      return new Response('ok');
    }

    const text: string = msg.text;
    const chatId = msg.chat.id;
    console.log('text:', text, 'chatId:', chatId);

    if (text.startsWith('/start')) {
      const token = text.split(' ')[1];
      console.log('parsed token:', token);
      if (!token) {
        await sendMessage(chatId, 'Открой этот чат через кнопку в приложении «Кенты» — там будет ссылка с кодом.');
        return new Response('ok');
      }
      const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
      const { data, error } = await supabase.from('pending_codes').select('code').eq('token', token).maybeSingle();
      console.log('db result:', JSON.stringify(data), 'error:', JSON.stringify(error));
      if (data) {
        const r = await sendMessage(chatId, `Твой код для входа в Кенты: ${data.code}`);
        console.log('sendMessage result:', JSON.stringify(r));
      } else {
        await sendMessage(chatId, 'Ссылка устарела — вернись в приложение и попробуй снова.');
      }
    }

    return new Response('ok');
  } catch (e) {
    console.error('ERROR:', e);
    return new Response('ok');
  }
});

async function sendMessage(chatId: number, text: string) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  return await res.json();
}
