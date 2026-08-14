import { useEffect, useRef, useState } from 'react';
import { loadState, saveState } from './storage';
import { DEFAULT_FRIENDS } from './data/friends';
import {
  getMyChats,
  sendMessage,
  deleteProfile,
  touchLastSeen,
  subscribeToAllMessages,
  getChatReads,
  markChatRead,
  getUnreadCounts,
} from './lib/db';
import { startPresence, stopPresence } from './lib/presence';
import { setupPush } from './lib/push';
import { startRingtone } from './utils/ringtone';
import { supabase } from './lib/supabase';
import { getActiveChatId } from './lib/activeChat';
import { registerCallWatcher, unregisterCallWatcher, registerResync } from './lib/activeCall';
import Login from './screens/Login';
import Chat from './screens/Chat';
import Purchases from './screens/Purchases';
import Birthdays from './screens/Birthdays';
import Games from './screens/Games';
import Profile from './screens/Profile';
import BottomNav from './components/BottomNav';
import './App.css';

// Purely decorative, CSS-driven — each group is invisible (opacity: 0) except
// on its own theme, where App.css fades it in and animates it. All render
// unconditionally so switching themes never needs a JS re-mount.
function ThemeEffects() {
  return (
    <>
      <div className="mint-leaves" aria-hidden="true">
        {Array.from({ length: 7 }, (_, i) => (
          <span key={i} className="leaf">🍃</span>
        ))}
      </div>
      <div className="sunset-embers" aria-hidden="true">
        {Array.from({ length: 7 }, (_, i) => (
          <span key={i} className="ember">🔥</span>
        ))}
      </div>
      <div className="purple-sparkles" aria-hidden="true">
        {Array.from({ length: 8 }, (_, i) => (
          <span key={i} className="sparkle">✨</span>
        ))}
      </div>
      <div className="cyberpunk-scan" aria-hidden="true" />
      <div className="space-stars" aria-hidden="true">
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} className="star">✦</span>
        ))}
        <span className="shooting-star" />
      </div>
      <div className="snow-flakes" aria-hidden="true">
        {Array.from({ length: 9 }, (_, i) => (
          <span key={i} className="flake">❄️</span>
        ))}
      </div>
      <div className="rain-drops" aria-hidden="true">
        {Array.from({ length: 14 }, (_, i) => (
          <span key={i} className="drop" />
        ))}
      </div>
      <div className="rainbow-glow" aria-hidden="true" />
      <div className="rainbow-strip" aria-hidden="true" />
    </>
  );
}

function snippetOf(row) {
  if (row.text) return row.text.slice(0, 80);
  if (row.sticker) return `${row.sticker} стикер`;
  if (row.image || row.images) return '📷 Фото';
  if (row.video) return '🎥 Видео';
  if (row.audio) return '🎤 Голосовое';
  if (row.poll) return `📊 ${row.poll.question}`;
  if (row.dice) return `🎲 Выпало ${row.dice}`;
  return 'Новое сообщение';
}

const TITLES = {
  chat: 'Кенты',
  purchases: 'Покупки',
  birthdays: 'Дни рождения',
  games: 'Игры',
  profile: 'Профиль',
};

export default function App() {
  const [user, setUser] = useState(() => loadState('user', null));
  const [rulesSeen, setRulesSeen] = useState(() => loadState('rulesSeen', false));
  const [tab, setTab] = useState('chat');
  const [friends, setFriends] = useState(() => loadState('friends', DEFAULT_FRIENDS));
  const [purchaseCount, setPurchaseCount] = useState(0);
  const [theme, setTheme] = useState(() => loadState('theme', 'dark'));
  const [chatJump, setChatJump] = useState(null);
  const [incomingCall, setIncomingCall] = useState(null);
  const [myChats, setMyChats] = useState([]);
  const myChatIdsRef = useRef(new Set());
  const [unreadCounts, setUnreadCounts] = useState({});
  const [msgBanner, setMsgBanner] = useState(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    saveState('theme', theme);
  }, [theme]);

  // myChats changes reference every ~20s (the poll below) even when its contents
  // are the same — reading it from a ref instead of a dependency means the
  // long-lived effect below can add/remove just the delta instead of tearing down
  // and rebuilding every channel on every poll tick (which was closing a real
  // presence-tracking channel and reopening a fresh one, risking a missed call
  // signal in the gap between unsubscribe and resubscribe).
  const myChatsRef = useRef([]);
  useEffect(() => {
    myChatsRef.current = myChats;
  }, [myChats]);

  // Watches every chat's call channel from anywhere in the app (not just while that
  // chat is open) so a call in progress actually shows up as a banner instead of
  // only being visible to whoever happens to already be looking at it. Used to only
  // watch the shared main group — DM calls never showed a banner to the callee
  // unless they'd already been pushed into that exact chat, which made DM calls
  // depend entirely on the FCM push (and its token) ever reaching the other phone.
  useEffect(() => {
    if (!user) return;
    const channelMap = {};

    function ensureChannel(chat) {
      if (channelMap[chat.id]) return;
      try {
        const channel = supabase.channel(`call:${chat.id}`);
        let calibrated = false;
        let wasEmpty = true;
        channel.on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState();
          const others = Object.keys(state).filter((phone) => phone !== user.phone);
          // The first read after a fresh (re)subscribe is a baseline snapshot, not
          // a trigger — right after hanging up, this same channel gets a fresh
          // subscription, and if the other side hasn't fully left the server yet,
          // that first read can still show them present. Without this, that stale
          // leftover read gets misread as a brand new incoming call.
          if (!calibrated) {
            calibrated = true;
            wasEmpty = others.length === 0;
            return;
          }
          const isEmpty = others.length === 0;
          if (!isEmpty && wasEmpty) {
            setIncomingCall({ chatId: chat.id, name: chat.name, emoji: chat.emoji });
          } else if (isEmpty) {
            // Someone left a *different* chat's call — don't clear this one's banner.
            setIncomingCall((current) => (current?.chatId === chat.id ? null : current));
          }
          wasEmpty = isEmpty;
        });
        channel.subscribe();
        channelMap[chat.id] = channel;
        // CallRoom needs sole ownership of this exact topic the moment it opens —
        // give it a way to reclaim this channel synchronously instead of leaving
        // both of us subscribed to it at once (see activeCall.js).
        registerCallWatcher(chat.id, () => {
          supabase.removeChannel(channel);
          delete channelMap[chat.id];
        });
      } catch (e) {
        console.error('call-watch subscribe failed for', chat.id, e);
      }
    }

    function sync() {
      const current = myChatsRef.current;
      current.forEach(ensureChannel);
      const currentIds = new Set(current.map((c) => c.id));
      Object.keys(channelMap).forEach((id) => {
        if (!currentIds.has(id)) {
          supabase.removeChannel(channelMap[id]);
          unregisterCallWatcher(id);
          delete channelMap[id];
        }
      });
    }

    sync();
    registerResync(sync);
    const interval = setInterval(sync, 20000);

    return () => {
      clearInterval(interval);
      registerResync(null);
      Object.keys(channelMap).forEach((id) => unregisterCallWatcher(id));
      Object.values(channelMap).forEach((c) => supabase.removeChannel(c));
    };
  }, [user?.phone]);

  // Rings for as long as the "someone's calling" screen is actually shown — a
  // silent banner is easy to miss entirely, especially with the phone in a pocket.
  useEffect(() => {
    if (!incomingCall) return;
    const stop = startRingtone();
    return stop;
  }, [incomingCall]);

  function joinIncomingCall() {
    if (!incomingCall) return;
    setChatJump({ chatId: incomingCall.chatId, nonce: Date.now(), autoCall: true });
    setTab('chat');
    setIncomingCall(null);
  }

  // The single app-wide "something new happened" pipeline: one realtime subscription
  // covering every chat (not just whichever one happens to be open), which powers
  // both the unread badges and the in-app banner below. Runs for the whole session,
  // not re-created per screen.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    // A chat created mid-session (new DM/group) — including one someone else just
    // created with you — wasn't picked up until the app restarted, so calls/messages
    // in it never reached this device's watchers. Re-polling the chat list keeps it
    // current without threading a live updater through every chat-creation path.
    async function refreshChats() {
      const chats = await getMyChats(user.phone);
      if (cancelled) return;
      setMyChats(chats);
      myChatIdsRef.current = new Set(chats.map((c) => c.id));
      return chats;
    }

    async function bootstrap() {
      const chats = await refreshChats();
      if (cancelled || !chats) return;

      const reads = await getChatReads(user.phone);
      // Chats that predate this feature have no read marker yet — seeding them to
      // "read as of right now" avoids dumping years of old messages into the first
      // unread count as if they all just arrived.
      const unseeded = chats.filter((c) => !reads[c.id]);
      await Promise.all(
        unseeded.map(async (c) => {
          reads[c.id] = await markChatRead(user.phone, c.id);
        })
      );
      if (cancelled) return;

      const counts = await getUnreadCounts(user.phone, chats.map((c) => c.id), reads);
      if (!cancelled) setUnreadCounts(counts);
    }
    bootstrap();
    const chatsPollInterval = setInterval(refreshChats, 20000);

    const unsubscribe = subscribeToAllMessages((row) => {
      if (row.author_phone === user.phone || row.author_phone === 'system') return;
      if (!myChatIdsRef.current.has(row.chat_id)) return; // not one of my chats
      if (getActiveChatId() === row.chat_id) {
        markChatRead(user.phone, row.chat_id);
        return;
      }
      setUnreadCounts((counts) => ({ ...counts, [row.chat_id]: (counts[row.chat_id] || 0) + 1 }));
      setMsgBanner({
        chatId: row.chat_id,
        authorName: row.author_name,
        preview: snippetOf(row),
      });
    });

    return () => {
      cancelled = true;
      clearInterval(chatsPollInterval);
      unsubscribe();
    };
  }, [user?.phone]);

  useEffect(() => {
    if (!msgBanner) return;
    const t = setTimeout(() => setMsgBanner(null), 4000);
    return () => clearTimeout(t);
  }, [msgBanner]);

  function openChatFromBanner() {
    if (!msgBanner) return;
    setChatJump({ chatId: msgBanner.chatId, nonce: Date.now() });
    setTab('chat');
    setMsgBanner(null);
  }

  function markRead(chatId) {
    setUnreadCounts((counts) => {
      if (!counts[chatId]) return counts;
      const next = { ...counts };
      delete next[chatId];
      return next;
    });
    markChatRead(user.phone, chatId);
  }

  useEffect(() => {
    if (!user) return;
    startPresence(user);
    setupPush(user, {
      onCall: (chatId) => {
        // If the in-app banner (Realtime) and the native push notification both
        // fired for this call and the call was accepted via the native
        // notification, the in-app banner/ringtone never got its own "stop"
        // signal — clear it here too so it doesn't keep ringing underneath a
        // call that's already connecting.
        setIncomingCall(null);
        setChatJump({ chatId, nonce: Date.now(), autoCall: true });
        setTab('chat');
      },
      onMessage: (chatId) => {
        setChatJump({ chatId, nonce: Date.now() });
        setTab('chat');
      },
    });
    touchLastSeen(user.phone);
    const interval = setInterval(() => touchLastSeen(user.phone), 60000);
    function onVisible() {
      if (document.visibilityState === 'visible') touchLastSeen(user.phone);
    }
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('beforeunload', () => touchLastSeen(user.phone));
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      stopPresence();
    };
  }, [user?.phone]);

  function handleLogin(u) {
    setUser(u);
    saveState('user', u);
  }

  function updateUser(u) {
    setUser(u);
    saveState('user', u);
  }

  function logout() {
    supabase.auth.signOut();
    saveState('user', null);
    setUser(null);
  }

  async function deleteAccount() {
    await deleteProfile(user.phone);
    await supabase.auth.signOut();
    saveState('user', null);
    setUser(null);
  }

  function addFriend(f) {
    const next = [...friends, f];
    setFriends(next);
    saveState('friends', next);
  }

  // Locally-added fake contacts (typed-in phone that doesn't belong to a real
  // account) — matches by phone first since the displayed id often gets
  // overridden to the phone number by the time it reaches FriendProfile.
  function removeFriend(target) {
    const next = friends.filter((f) => !((target.phone && f.phone === target.phone) || f.id === target.id));
    setFriends(next);
    saveState('friends', next);
  }

  async function congratulate(friend) {
    const mine = await getMyChats(user.phone);
    const mainChat = mine.find((c) => c.is_main) || mine[0];
    if (!mainChat) return;
    await sendMessage(mainChat.id, {
      authorPhone: user.phone,
      author: user.name,
      emoji: user.emoji,
      avatarImg: user.avatarImg || null,
      text: `🎉 Поздравляю с днём рождения, ${friend.name}! Пусть всё будет ${friend.emoji}`,
    });
    setChatJump({ chatId: mainChat.id, nonce: Date.now() });
    setTab('chat');
  }

  if (!user) {
    return (
      <div className="phone">
        <ThemeEffects />
        <Login onComplete={handleLogin} />
      </div>
    );
  }

  return (
    <div className="phone">
      <ThemeEffects />
      <div className="app-shell">
        <div className="topbar">
          <h2>{TITLES[tab]}</h2>
          <span>{user.emoji}</span>
        </div>
        {tab === 'chat' && (
          <Chat user={user} jump={chatJump} friends={friends} onAddFriend={addFriend} unreadCounts={unreadCounts} onChatOpened={markRead} />
        )}
        {tab === 'purchases' && (
          <Purchases user={user} friends={friends} onCountChange={setPurchaseCount} onRemoveFriend={removeFriend} />
        )}
        {tab === 'birthdays' && (
          <Birthdays user={user} friends={friends} onAddFriend={addFriend} onRemoveFriend={removeFriend} onCongratulate={congratulate} />
        )}
        {tab === 'games' && <Games user={user} />}
        {tab === 'profile' && (
          <Profile
            user={user}
            onUpdate={updateUser}
            friends={friends}
            purchaseCount={purchaseCount}
            theme={theme}
            onThemeChange={setTheme}
            onLogout={logout}
            onDeleteAccount={deleteAccount}
          />
        )}
      </div>

      {incomingCall && (
        <div className="incoming-call-screen">
          <div className="incoming-call-pulse">{incomingCall.emoji}</div>
          <div className="incoming-call-label">Входящий звонок</div>
          <div className="incoming-call-name">{incomingCall.name}</div>
          <div className="incoming-call-actions">
            <button className="call-action decline" onClick={() => setIncomingCall(null)}>
              <span>✕</span>
              <small>Отклонить</small>
            </button>
            <button className="call-action accept" onClick={joinIncomingCall}>
              <span>📞</span>
              <small>Принять</small>
            </button>
          </div>
        </div>
      )}

      {msgBanner && (
        <div className="msg-banner" onClick={openChatFromBanner}>
          <div className="msg-banner-title">{msgBanner.authorName}</div>
          <div className="msg-banner-preview">{msgBanner.preview}</div>
        </div>
      )}

      {!rulesSeen && (
        <div className="modal-backdrop">
          <div className="modal-sheet">
            <h3>📜 Правила тусовки</h3>
            <p className="sub">Тут только свои, но пара правил есть:</p>
            <ul style={{ margin: '8px 0', paddingLeft: 20, lineHeight: 1.7 }}>
              <li>Мат в чате — 10 ₽ штрафа, автоматически записывается как покупка</li>
              <li>Чужие сообщения не трогаем — удалять/редактировать можно только своё (или если ты админ/владелец чата)</li>
              <li>Не спамим — в чатах с антиспамом между сообщениями пауза 3 секунды</li>
              <li>Уважаем друг друга — это тусовка своих, а не поле для срачей</li>
            </ul>
            <button
              className="btn"
              onClick={() => {
                setRulesSeen(true);
                saveState('rulesSeen', true);
              }}
            >
              Понятно
            </button>
          </div>
        </div>
      )}

      <BottomNav active={tab} onChange={setTab} />
    </div>
  );
}
