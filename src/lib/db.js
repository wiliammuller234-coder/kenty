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

export async function touchLastSeen(phone) {
  await supabase.from('profiles').update({ last_seen: new Date().toISOString() }).eq('phone', phone);
}

export async function getGroupPurchases(phones) {
  const { data, error } = await supabase
    .from('purchases')
    .select('*')
    .in('buyer_phone', phones)
    .order('created_at', { ascending: true });
  if (error || !data) return [];
  return data.map(fromPurchaseRow);
}

export async function deletePurchaseRow(id) {
  await supabase.from('purchases').delete().eq('id', id);
}

export async function getGroupPromises(phones) {
  const { data, error } = await supabase
    .from('promises')
    .select('*')
    .in('author_phone', phones)
    .order('created_at', { ascending: true });
  if (error || !data) return [];
  return data.map(fromPromiseRow);
}

export async function addPromiseRow(authorPhone, text, deadline) {
  const { data, error } = await supabase
    .from('promises')
    .insert({ author_phone: authorPhone, text, deadline })
    .select()
    .single();
  if (error) return { error };
  return { promise: fromPromiseRow(data) };
}

export async function updatePromiseRow(id, patch) {
  const row = {};
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.votesAgainst !== undefined) row.votes_against = patch.votesAgainst;
  await supabase.from('promises').update(row).eq('id', id);
}

export function subscribeToPromises(onChange) {
  const channel = supabase
    .channel('promises-all')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'promises' }, (payload) =>
      onChange(payload.eventType, payload.new ? fromPromiseRow(payload.new) : payload.old?.id)
    )
    .subscribe();
  return () => supabase.removeChannel(channel);
}

function fromPromiseRow(row) {
  return {
    id: row.id,
    authorPhone: row.author_phone,
    text: row.text,
    deadline: row.deadline,
    status: row.status,
    votesAgainst: row.votes_against || [],
  };
}

export async function addPurchaseRow(buyerPhone, item, amount) {
  const { data, error } = await supabase
    .from('purchases')
    .insert({ buyer_phone: buyerPhone, item, amount })
    .select()
    .single();
  if (error) return { error };
  return { purchase: fromPurchaseRow(data) };
}

// Each mini-game has its own leaderboard (composite key: game + phone) rather than
// one blended table — a win/lose/draw game and a high-score game don't share a
// ranking metric, so mixing them into one list would've been meaningless.
export async function getGameScores(game) {
  const { data, error } = await supabase.from('game_scores').select('*').eq('game', game);
  if (error || !data) return [];
  return data.map((r) => ({ phone: r.phone, wins: r.wins, losses: r.losses, draws: r.draws, bestScore: r.best_score }));
}

// Read-modify-write rather than an atomic increment — fine for a casual mini-game
// among friends, not worth a Postgres RPC just to close a race window nobody will hit.
export async function recordGameResult(game, phone, outcome) {
  const { data: existing } = await supabase.from('game_scores').select('*').eq('game', game).eq('phone', phone).maybeSingle();
  const row = existing || { game, phone, wins: 0, losses: 0, draws: 0, best_score: 0 };
  const field = outcome === 'win' ? 'wins' : outcome === 'lose' ? 'losses' : 'draws';
  row[field] = (row[field] || 0) + 1;
  await supabase.from('game_scores').upsert({ ...row, updated_at: new Date().toISOString() });
}

// Only writes when it's an actual new personal best — otherwise every single run
// (including worse ones) would overwrite the leaderboard entry for nothing.
// higherIsBetter=false is for games like reaction time, where a lower number (faster
// reflexes) is the win — "best" still just means best_score, the leaderboard UI is
// what sorts ascending vs descending depending on the game.
export async function recordGameScore(game, phone, score, { higherIsBetter = true } = {}) {
  const { data: existing } = await supabase.from('game_scores').select('*').eq('game', game).eq('phone', phone).maybeSingle();
  const isBetter = !existing || (higherIsBetter ? score > existing.best_score : score < existing.best_score);
  if (!isBetter) return existing.best_score;
  const row = existing || { game, phone, wins: 0, losses: 0, draws: 0 };
  await supabase.from('game_scores').upsert({ ...row, best_score: score, updated_at: new Date().toISOString() });
  return score;
}

// Every attempt gets its own row (see supabase-migration-19.sql) — the leaderboard
// below reduces that history down to "each player's single best attempt" itself,
// client-side, rather than needing the schema to track a running best.
export async function logMathScore(phone, { difficulty, timeLimit, correct, wrong, score }) {
  await supabase.from('math_scores').insert({
    phone,
    difficulty,
    time_limit: timeLimit,
    correct_answers: correct,
    wrong_answers: wrong,
    score,
  });
}

// Returns { rows, myRank, totalPlayers } — rows is each player's best attempt
// (correct answers first, then score, then fewer mistakes as the tiebreakers named
// in the request), optionally narrowed to one difficulty first.
export async function getMathLeaderboard(phone, difficulty) {
  let query = supabase.from('math_scores').select('phone, difficulty, time_limit, correct_answers, wrong_answers, score');
  if (difficulty) query = query.eq('difficulty', difficulty);
  const { data } = await query;
  const rows = data || [];

  const bestByPhone = new Map();
  for (const r of rows) {
    const current = bestByPhone.get(r.phone);
    if (!current || isBetterAttempt(r, current)) bestByPhone.set(r.phone, r);
  }
  const sorted = [...bestByPhone.values()].sort((a, b) => (isBetterAttempt(a, b) ? -1 : isBetterAttempt(b, a) ? 1 : 0));
  const myIndex = sorted.findIndex((r) => r.phone === phone);
  return {
    rows: sorted.slice(0, 20),
    myRank: myIndex === -1 ? null : myIndex + 1,
    totalPlayers: sorted.length,
    myBest: myIndex === -1 ? null : sorted[myIndex],
  };
}

function isBetterAttempt(a, b) {
  if (a.correct_answers !== b.correct_answers) return a.correct_answers > b.correct_answers;
  if (a.score !== b.score) return a.score > b.score;
  return a.wrong_answers < b.wrong_answers;
}

export function subscribeToPurchases(onInsert) {
  const channel = supabase
    .channel('purchases-all')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'purchases' }, (payload) =>
      onInsert(fromPurchaseRow(payload.new))
    )
    .subscribe();
  return () => supabase.removeChannel(channel);
}

function fromPurchaseRow(row) {
  return { id: row.id, buyerPhone: row.buyer_phone, item: row.item, amount: row.amount, date: row.created_at };
}

// Fires for every message insert app-wide, not scoped to one chat — the piece that
// was missing for unread counts / in-app banners to work for chats you don't
// currently have open. Callers filter to their own chats client-side.
export function subscribeToAllMessages(onInsert) {
  const channel = supabase
    .channel('all-messages')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => onInsert(payload.new))
    .subscribe();
  return () => supabase.removeChannel(channel);
}

export async function getChatReads(phone) {
  const { data } = await supabase.from('chat_reads').select('chat_id, last_read_at').eq('phone', phone);
  const map = {};
  (data || []).forEach((r) => {
    map[r.chat_id] = r.last_read_at;
  });
  return map;
}

export async function markChatRead(phone, chatId) {
  const now = new Date().toISOString();
  await supabase.from('chat_reads').upsert({ phone, chat_id: chatId, last_read_at: now });
  return now;
}

// One query for every chat at once rather than one per chat — fine at friend-group
// scale, and simpler than a server-side aggregate just for this.
export async function getUnreadCounts(phone, chatIds, readsMap) {
  if (chatIds.length === 0) return {};
  const { data } = await supabase
    .from('messages')
    .select('chat_id, created_at, author_phone')
    .in('chat_id', chatIds)
    .neq('author_phone', phone);
  const counts = {};
  (data || []).forEach((m) => {
    const since = readsMap[m.chat_id];
    if (!since || new Date(m.created_at) > new Date(since)) {
      counts[m.chat_id] = (counts[m.chat_id] || 0) + 1;
    }
  });
  return counts;
}

export async function savePushToken(phone, token) {
  await supabase.from('push_tokens').upsert({ phone, token, platform: 'android' }, { onConflict: 'phone,token' });
}

// crypto.randomUUID() only exists in "secure contexts" (HTTPS or localhost) — it's
// simply undefined when the site is opened over plain HTTP by LAN IP, which is
// exactly how this gets tested from a phone on the home network. getRandomValues()
// has no such restriction, so build the token from that instead.
export function randomToken() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function createPendingCode(phone) {
  const token = randomToken();
  const code = String(Math.floor(1000 + Math.random() * 9000));
  const { error } = await supabase.from('pending_codes').insert({ token, phone, code });
  if (error) return null;
  return { token, code };
}

// Runs the comparison server-side now (see verify-code Edge Function) instead of
// fetching the plaintext code to the browser and comparing it in JS — the old way
// meant reading the row (public SELECT) was itself enough to "verify" without ever
// touching the Telegram bot. On success the function hands back a one-time admin
// link token (not a session itself), which verifyOtp() redeems into a REAL Supabase
// session here — that's what actually gets signed by Supabase and accepted
// everywhere, vs. a token this app tried to sign itself.
export async function checkPendingCode(token, codeInput, phone) {
  try {
    const res = await fetch('https://kprfjlcydxqpcgwjzafw.supabase.co/functions/v1/verify-code', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: 'sb_publishable_h-w7eAaBfmktfdRa1YG-sQ_Zqnxhhou',
        Authorization: 'Bearer sb_publishable_h-w7eAaBfmktfdRa1YG-sQ_Zqnxhhou',
      },
      body: JSON.stringify({ token, code: codeInput, phone }),
    });
    const result = await res.json();
    if (!result.ok) return false;
    // generateLink() on the server returns a token_hash, not a plain OTP token — that
    // pairs with verifyOtp's { token_hash, type } form, not { email, token, type }
    // (which is for the 6-digit-code-by-email flow). Using the wrong shape here made
    // this silently fail even when the code itself matched, and every failure —
    // network error, wrong code, or this — collapsed into the same "Неверный код"
    // message, which is exactly what made it look like the code comparison was broken
    // when the real problem was one step further along.
    const { error } = await supabase.auth.verifyOtp({ token_hash: result.hashedToken, type: 'magiclink' });
    if (error) console.error('[checkPendingCode] verifyOtp failed', error);
    return !error;
  } catch (e) {
    console.error('[checkPendingCode] unexpected error', e);
    return false;
  }
}

export async function deleteProfile(phone) {
  // Used to only remove the profile row, leaving chat_members/push_tokens behind —
  // the account "vanished" but still showed up everywhere as a bare phone number,
  // since every list is really built from group membership, not the profile table.
  await supabase.from('chat_members').delete().eq('phone', phone);
  await supabase.from('push_tokens').delete().eq('phone', phone);
  const { error } = await supabase.from('profiles').delete().eq('phone', phone);
  return { error };
}

export async function getProfileByPhone(phone) {
  const { data, error } = await supabase.from('profiles').select('*').eq('phone', phone).maybeSingle();
  if (error || !data) return null;
  return fromProfileRow(data);
}

function fromProfileRow(data) {
  return {
    phone: data.phone,
    name: data.name,
    emoji: data.emoji,
    avatarImg: data.avatar_img,
    age: data.age,
    birthday: data.birthday,
    lastSeen: data.last_seen,
  };
}

export async function getMyChats(phone) {
  const { data, error } = await supabase
    .from('chat_members')
    .select('role, chats(*)')
    .eq('phone', phone);
  if (error || !data) return [];
  const chats = data.filter((row) => row.chats).map((row) => ({ ...row.chats, myRole: row.role }));

  // DM chats used to store one static name/emoji picked by whoever created them, so
  // both participants ended up seeing the SAME label (often the other person's own
  // name shown right back at them). Override it per-viewer with whoever's actually
  // on the other end, using their current profile — never stale, never one-sided.
  const dmIds = chats.filter((c) => c.is_dm).map((c) => c.id);
  if (dmIds.length > 0) {
    const { data: members } = await supabase
      .from('chat_members')
      .select('chat_id, phone')
      .in('chat_id', dmIds)
      .neq('phone', phone);
    const otherPhoneByChat = new Map((members || []).map((m) => [m.chat_id, m.phone]));
    const otherPhones = [...new Set(otherPhoneByChat.values())];
    const profiles = await Promise.all(otherPhones.map((p) => getProfileByPhone(p)));
    const profileByPhone = new Map(otherPhones.map((p, i) => [p, profiles[i]]));
    for (const chat of chats) {
      if (!chat.is_dm) continue;
      const otherProfile = profileByPhone.get(otherPhoneByChat.get(chat.id));
      if (otherProfile) {
        chat.name = otherProfile.name;
        chat.emoji = otherProfile.emoji;
        chat.avatarImg = otherProfile.avatarImg;
      }
    }
  }
  return chats;
}

// Two people separately adding each other by phone used to spawn two independent
// DM chats with the same members — always look for an existing one-on-one first.
export async function findDMChat(myPhone, otherPhone) {
  const { data: mine } = await supabase
    .from('chat_members')
    .select('chat_id, chats!inner(is_dm)')
    .eq('phone', myPhone)
    .eq('chats.is_dm', true);
  const chatIds = (mine || []).map((r) => r.chat_id);
  if (chatIds.length === 0) return null;
  const { data: shared } = await supabase
    .from('chat_members')
    .select('chat_id')
    .eq('phone', otherPhone)
    .in('chat_id', chatIds);
  if (!shared || shared.length === 0) return null;
  const { data: chat } = await supabase.from('chats').select('*').eq('id', shared[0].chat_id).maybeSingle();
  return chat ? { ...chat, myRole: 'owner' } : null;
}

// Every registrant used to get their own private "Кенты" chat instead of landing in
// one shared group together — this finds the single canonical main chat (creating it
// once, the very first time anyone signs up) and just adds new members to it.
export async function joinOrCreateMainChat(user) {
  const { data: existing } = await supabase.from('chats').select('*').eq('is_main', true).maybeSingle();
  if (existing) {
    const { data: already } = await supabase
      .from('chat_members')
      .select('phone')
      .eq('chat_id', existing.id)
      .eq('phone', user.phone)
      .maybeSingle();
    if (!already) {
      await supabase.from('chat_members').insert({ chat_id: existing.id, phone: user.phone, role: 'member' });
      await postSystemMessage(existing.id, `${user.name} присоединился(ась) к группе`);
    }
    return { ...existing, myRole: already ? 'member' : 'member' };
  }
  const { data, error } = await supabase
    .from('chats')
    .insert({ name: 'Кенты', emoji: '🔥', description: 'Главная группа — тут все свои', is_dm: false, created_by: user.phone, is_main: true })
    .select()
    .single();
  if (error || !data) return null;
  await supabase.from('chat_members').insert({ chat_id: data.id, phone: user.phone, role: 'owner' });
  return { ...data, myRole: 'owner' };
}

export async function getMainChatMembers(phone) {
  const chats = await getMyChats(phone);
  const main = chats.find((c) => c.is_main);
  if (!main) return [];
  return getChatMembers(main.id);
}

export async function createChat({ name, emoji, description, isDM = false, createdBy, memberPhones }) {
  if (isDM && memberPhones.length === 1) {
    const existing = await findDMChat(createdBy, memberPhones[0]);
    if (existing) return existing;
  }
  const { data, error } = await supabase
    .from('chats')
    .insert({ name, emoji, description: description || null, is_dm: isDM, created_by: createdBy })
    .select()
    .single();
  if (error || !data) return null;
  const others = memberPhones.filter((p) => p !== createdBy);
  const rows = [
    { chat_id: data.id, phone: createdBy, role: 'owner' },
    ...others.map((phone) => ({ chat_id: data.id, phone, role: 'member' })),
  ];
  await supabase.from('chat_members').insert(rows);
  if (!isDM) {
    await postSystemMessage(data.id, `Группа «${name}» создана`);
  }
  return { ...data, myRole: 'owner' };
}

export async function updateChat(chatId, patch) {
  const row = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.emoji !== undefined) row.emoji = patch.emoji;
  if (patch.accent !== undefined) row.accent = patch.accent;
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.antispam !== undefined) row.antispam = patch.antispam;
  await supabase.from('chats').update(row).eq('id', chatId);
}

export async function getChatMembers(chatId) {
  const { data, error } = await supabase.from('chat_members').select('phone, role').eq('chat_id', chatId);
  if (error || !data) return [];
  const profiles = await Promise.all(data.map((m) => getProfileByPhone(m.phone)));
  return data.map((m, i) => ({
    phone: m.phone,
    role: m.role,
    profile: profiles[i] || { phone: m.phone, name: m.phone, emoji: '🙂' },
  }));
}

export async function addChatMembers(chatId, phones) {
  const rows = phones.map((phone) => ({ chat_id: chatId, phone, role: 'member' }));
  await supabase.from('chat_members').upsert(rows, { onConflict: 'chat_id,phone' });
}

export async function removeChatMember(chatId, phone) {
  await supabase.from('chat_members').delete().eq('chat_id', chatId).eq('phone', phone);
}

export async function setMemberRole(chatId, phone, role) {
  await supabase.from('chat_members').update({ role }).eq('chat_id', chatId).eq('phone', phone);
}

export async function getMessages(chatId) {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true });
  if (error) return [];
  const messages = data.map(fromRow);

  // Name/emoji/avatar used to be frozen into each message at send time, so changing
  // your profile picture never touched anything you'd already sent — this replaces
  // them with whatever the sender's profile looks like right now.
  const phones = [...new Set(messages.map((m) => m.authorPhone).filter((p) => p && p !== 'system'))];
  if (phones.length > 0) {
    const profiles = await Promise.all(phones.map((p) => getProfileByPhone(p)));
    const profileByPhone = new Map(phones.map((p, i) => [p, profiles[i]]));
    for (const m of messages) {
      const profile = profileByPhone.get(m.authorPhone);
      if (profile) {
        m.author = profile.name;
        m.emoji = profile.emoji;
        m.avatarImg = profile.avatarImg;
      }
    }
  }
  return messages;
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
    images: msg.images || null,
    video: msg.video || null,
    dice: msg.dice || null,
    is_sticker: !!msg.isSticker,
    audio: msg.audio || null,
    reply_to_id: msg.replyTo?.id || null,
    reply_to_author: msg.replyTo?.author || null,
    reply_to_text: msg.replyTo ? snippetOf(msg.replyTo) : null,
    poll: msg.poll || null,
  };
  const { data, error } = await supabase.from('messages').insert(row).select().single();
  if (error || !data) return { error, message: null };
  return { error: null, message: fromRow(data) };
}

function snippetOf(m) {
  if (m.text) return m.text.slice(0, 120);
  if (m.sticker) return m.sticker;
  if (m.image) return '📷 Фото';
  if (m.images) return `📷 Фото (${m.images.length})`;
  if (m.video) return '🎥 Видео';
  if (m.dice) return `🎲 Выпало ${m.dice}`;
  if (m.audio) return '🎤 Голосовое';
  if (m.poll) return `📊 ${m.poll.question}`;
  return '';
}

export async function postSystemMessage(chatId, text) {
  await supabase.from('messages').insert({
    chat_id: chatId,
    author_phone: 'system',
    author_name: 'Система',
    author_emoji: 'ℹ️',
    text,
  });
}

export async function editMessage(id, text) {
  await supabase.from('messages').update({ text, edited: true }).eq('id', id);
}

export async function votePoll(message, optionIndex, phone, multi) {
  const options = message.poll.options.map((o, i) => {
    const votes = new Set(o.votes || []);
    if (i === optionIndex) {
      if (votes.has(phone)) votes.delete(phone);
      else votes.add(phone);
    } else if (!multi && votes.has(phone)) {
      votes.delete(phone);
    }
    return { ...o, votes: [...votes] };
  });
  const poll = { ...message.poll, options };
  await supabase.from('messages').update({ poll }).eq('id', message.id);
}

export async function updateMessageReactions(id, reactions, reactedByPhone) {
  await supabase.from('messages').update({ reactions, reacted_by: reactedByPhone }).eq('id', id);
}

export async function deleteMessage(id) {
  await supabase.from('messages').delete().eq('id', id);
}

export async function clearChatMessages(chatId) {
  await supabase.from('messages').delete().eq('chat_id', chatId);
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
    system: row.author_phone === 'system',
    text: row.text,
    sticker: row.sticker,
    image: row.image,
    images: row.images,
    video: row.video,
    dice: row.dice,
    isSticker: row.is_sticker,
    audio: row.audio,
    edited: row.edited || false,
    replyTo: row.reply_to_id ? { id: row.reply_to_id, author: row.reply_to_author, text: row.reply_to_text } : null,
    poll: row.poll || null,
    reactions: row.reactions || {},
    reactedBy: row.reacted_by || {},
    createdAt: row.created_at,
    time: new Date(row.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
  };
}
