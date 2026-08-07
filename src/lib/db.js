import { supabase } from './supabase';

export async function upsertProfile(user) {
  const { error } = await supabase.from('profiles').upsert({
    phone: user.phone,
    name: user.name,
    emoji: user.emoji,
    avatar_img: user.avatarImg || null,
    age: user.age || null,
    birthday: user.birthday || null,
  });
  return { error };
}

export async function createPendingCode(phone) {
  const token = crypto.randomUUID();
  const code = String(Math.floor(1000 + Math.random() * 9000));
  const { error } = await supabase.from('pending_codes').insert({ token, phone, code });
  if (error) return null;
  return { token, code };
}

export async function checkPendingCode(token, codeInput) {
  const { data } = await supabase.from('pending_codes').select('code').eq('token', token).maybeSingle();
  return !!data && data.code === codeInput;
}

export async function deleteProfile(phone) {
  const { error } = await supabase.from('profiles').delete().eq('phone', phone);
  return { error };
}

export async function getProfileByPhone(phone) {
  const { data, error } = await supabase.from('profiles').select('*').eq('phone', phone).maybeSingle();
  if (error || !data) return null;
  return {
    phone: data.phone,
    name: data.name,
    emoji: data.emoji,
    avatarImg: data.avatar_img,
    age: data.age,
    birthday: data.birthday,
  };
}

export async function getMyChats(phone) {
  const { data, error } = await supabase
    .from('chat_members')
    .select('chats(*)')
    .eq('phone', phone);
  if (error || !data) return [];
  return data.map((row) => row.chats).filter(Boolean);
}

export async function createChat({ name, emoji, isDM = false, createdBy, memberPhones }) {
  const { data, error } = await supabase
    .from('chats')
    .insert({ name, emoji, is_dm: isDM, created_by: createdBy })
    .select()
    .single();
  if (error || !data) return null;
  const members = [createdBy, ...memberPhones.filter((p) => p !== createdBy)];
  await supabase.from('chat_members').insert(members.map((phone) => ({ chat_id: data.id, phone })));
  return data;
}

export async function updateChat(chatId, patch) {
  const row = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.emoji !== undefined) row.emoji = patch.emoji;
  if (patch.accent !== undefined) row.accent = patch.accent;
  await supabase.from('chats').update(row).eq('id', chatId);
}

export async function getMessages(chatId) {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true });
  if (error) return [];
  return data.map(fromRow);
}

export async function sendMessage(chatId, msg) {
  const row = {
    chat_id: chatId,
    author_phone: msg.authorPhone,
    author_name: msg.author,
    author_emoji: msg.emoji,
    author_avatar: msg.avatarImg || null,
    text: msg.text || null,
    sticker: msg.sticker || null,
    image: msg.image || null,
    is_sticker: !!msg.isSticker,
    audio: msg.audio || null,
  };
  const { data, error } = await supabase.from('messages').insert(row).select().single();
  if (error || !data) return { error, message: null };
  return { error: null, message: fromRow(data) };
}

export async function updateMessageReactions(id, reactions, reactedByPhone) {
  await supabase.from('messages').update({ reactions, reacted_by: reactedByPhone }).eq('id', id);
}

export async function deleteMessage(id) {
  await supabase.from('messages').delete().eq('id', id);
}

export function subscribeToChat(chatId, onInsert, onUpdate, onDelete) {
  const channel = supabase
    .channel(`messages-${chatId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` }, (payload) =>
      onInsert(fromRow(payload.new))
    )
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` }, (payload) =>
      onUpdate(fromRow(payload.new))
    )
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` }, (payload) =>
      onDelete(payload.old.id)
    )
    .subscribe();
  return () => supabase.removeChannel(channel);
}

function fromRow(row) {
  return {
    id: row.id,
    author: row.author_name,
    emoji: row.author_emoji,
    avatarImg: row.author_avatar,
    authorPhone: row.author_phone,
    text: row.text,
    sticker: row.sticker,
    image: row.image,
    isSticker: row.is_sticker,
    audio: row.audio,
    reactions: row.reactions || {},
    reactedBy: row.reacted_by || {},
    time: new Date(row.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
  };
}
