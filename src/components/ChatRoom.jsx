import { useEffect, useRef, useState } from 'react';
import { STICKERS } from '../data/stickers';
import { CHAT_EMOJIS } from '../data/chats';
import { processImageFile } from '../utils/image';
import { getShameTag } from '../utils/promises';
import { getCustomStickers, addCustomSticker } from '../utils/customStickers';
import { getBlocked } from '../utils/blocked';
import { loadState } from '../storage';
import {
  getMessages,
  sendMessage,
  subscribeToChat,
  updateMessageReactions,
  deleteMessage as dbDeleteMessage,
  clearChatMessages,
  editMessage,
  votePoll,
  getChatMembers,
  addPurchaseRow,
  markChatRead,
} from '../lib/db';
import { containsProfanity } from '../utils/profanity';
import { setActiveChatId, getActiveChatId } from '../lib/activeChat';
import VoiceMessage from './VoiceMessage';
import CallRoom from './CallRoom';
import GroupMembers from './GroupMembers';
import PollMessage from './PollMessage';
import PresenceStatus from './PresenceStatus';
import FriendProfile from './FriendProfile';

const ACCENT_COLORS = ['#6c5ce7', '#00d9a3', '#ff7a59', '#3aa6ff', '#ff2ec4', '#2ee6a6'];
const DICE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
const REACTIONS = ['❤️', '👍', '😂', '😮', '😢'];

export default function ChatRoom({ user, chat, myRole, friends, onBack, onUpdateChat, onLeaveChat, autoJoinCall }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [stickersOpen, setStickersOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [pollOpen, setPollOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [reactingId, setReactingId] = useState(null);
  const [menuId, setMenuId] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [chatNameDraft, setChatNameDraft] = useState(chat.name);
  const [descDraft, setDescDraft] = useState(chat.description || '');
  const [otherPhone, setOtherPhone] = useState(null);
  const [otherLastSeen, setOtherLastSeen] = useState(null);
  const [inCall, setInCall] = useState(null);
  // Distinguishes "I'm starting a new call" (send the incoming-call push) from
  // "I'm joining a call someone already started" (accepting a banner/notification)
  // — CallRoom used to notify-call unconditionally on mount, so accepting a call
  // fired a second, spurious "incoming call" push back at the original caller.
  const [callIsJoin, setCallIsJoin] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [viewProfile, setViewProfile] = useState(null);
  // processImageFile/fileToDataUrl are async and can take a real moment for a large
  // photo or video with nothing on screen to show for it in the meantime — this is
  // what used to make it unclear whether picking media had actually done anything.
  const [mediaUploading, setMediaUploading] = useState(false);
  const [newBelow, setNewBelow] = useState(0);
  const [customStickers, setCustomStickers] = useState(() => getCustomStickers());
  const [spamWarning, setSpamWarning] = useState('');
  const [blockedPhones, setBlockedPhones] = useState(() => getBlocked());
  const canManage = myRole === 'owner' || myRole === 'admin';
  const shameTag = getShameTag(loadState('promises', []));
  const lastSentRef = useRef(0);
  const endRef = useRef(null);
  const screenRef = useRef(null);
  const contentRef = useRef(null);
  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const stopRequestedRef = useRef(false);
  const recordStartRef = useRef(0);
  const [recSeconds, setRecSeconds] = useState(0);
  const recTimerRef = useRef(null);
  // Whether the view is currently anchored to the bottom — a new message only
  // auto-scrolls when this is true, so reading old messages never gets yanked down.
  const stickBottomRef = useRef(true);
  const prevCountRef = useRef(0);
  const firstLoadRef = useRef(true);
  const programmaticScrollRef = useRef(false);
  const programmaticScrollTimerRef = useRef(null);
  // Opening the reaction picker (or a poll re-render) changes contentRef's height
  // exactly like a photo/voice message finishing loading does — which the
  // ResizeObserver below can't tell apart from real new content, so without this it
  // force-scrolled the whole chat to the bottom every time someone just tapped a
  // message to react, flinging whatever they'd tapped clean off screen.
  const suppressResizeScrollRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setActiveChatId(chat.id);
    markChatRead(user.phone, chat.id);
    getMessages(chat.id).then((rows) => {
      if (!cancelled) {
        setMessages(rows);
        setLoading(false);
      }
    });
    const unsubscribe = subscribeToChat(
      chat.id,
      (msg) => setMessages((list) => (list.some((m) => m.id === msg.id) ? list : [...list, msg])),
      (msg) => setMessages((list) => list.map((m) => (m.id === msg.id ? msg : m))),
      (id) => setMessages((list) => list.filter((m) => m.id !== id))
    );
    return () => {
      cancelled = true;
      unsubscribe();
      // Only clear if nothing newer already claimed it — switching straight from one
      // chat to another can mount the next ChatRoom before this cleanup runs.
      if (getActiveChatId() === chat.id) setActiveChatId(null);
    };
  }, [chat.id]);

  useEffect(() => {
    if (!chat.isDM) return;
    getChatMembers(chat.id).then((members) => {
      const other = members.find((m) => m.phone !== user.phone);
      if (other) {
        setOtherPhone(other.phone);
        setOtherLastSeen(other.profile?.lastSeen || null);
      }
    });
  }, [chat.id, chat.isDM, user.phone]);

  useEffect(() => {
    if (autoJoinCall) {
      setCallIsJoin(true);
      setInCall('audio');
    }
  }, [autoJoinCall]);

  useEffect(() => {
    const grew = messages.length > prevCountRef.current;
    const last = messages[messages.length - 1];
    const isMine = last && last.authorPhone === user.phone;
    if (firstLoadRef.current && !loading) {
      firstLoadRef.current = false;
      scrollToEnd();
    } else if (grew && (stickBottomRef.current || isMine)) {
      scrollToEnd();
    } else if (grew) {
      setNewBelow((n) => n + (messages.length - prevCountRef.current));
    }
    prevCountRef.current = messages.length;
  }, [messages, loading]);

  useEffect(() => {
    // Catches layout shift after the scroll already ran — images/stickers/voice bars
    // that finish loading a moment later used to leave the view stuck mid-way.
    // Only follows it down when the user was already anchored to the bottom.
    const content = contentRef.current;
    if (!content || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (suppressResizeScrollRef.current) {
        suppressResizeScrollRef.current = false;
        return;
      }
      if (stickBottomRef.current) scrollToEnd();
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  function scrollToEnd() {
    // scrollIntoView triggers its own native 'scroll' event a moment later. Without this
    // flag, handleScroll would read the still-pre-layout-shift scrollHeight (image/voice
    // player hasn't expanded yet), decide we're "not at the bottom", and flip
    // stickBottomRef back off — silently cancelling the very scroll we just did, which is
    // exactly why photos/voice/stickers used to get stuck instead of following down.
    programmaticScrollRef.current = true;
    clearTimeout(programmaticScrollTimerRef.current);
    programmaticScrollTimerRef.current = setTimeout(() => {
      programmaticScrollRef.current = false;
    }, 400);
    endRef.current?.scrollIntoView({ block: 'end' });
    stickBottomRef.current = true;
    setNewBelow(0);
  }

  function scrollToMessage(id) {
    document.getElementById(`msg-${id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function handleScroll() {
    if (programmaticScrollRef.current) return;
    const el = screenRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distanceFromBottom < 80;
    stickBottomRef.current = atBottom;
    if (atBottom) setNewBelow(0);
  }

  async function pushMessage(extra) {
    if (chat.antispam && myRole === 'member') {
      const sinceLast = Date.now() - lastSentRef.current;
      if (sinceLast < 3000) {
        setSpamWarning(`Тут включён антиспам — подожди ${Math.ceil((3000 - sinceLast) / 1000)} сек`);
        setTimeout(() => setSpamWarning(''), 2000);
        return;
      }
    }
    lastSentRef.current = Date.now();
    const { message, error } = await sendMessage(chat.id, {
      authorPhone: user.phone,
      author: user.name,
      emoji: user.emoji,
      avatarImg: user.avatarImg || null,
      replyTo,
      ...extra,
    });
    if (error) {
      alert('Не отправилось: ' + (error.message || 'ошибка базы данных. Убедись, что применена вся SQL-миграция.'));
      return;
    }
    // Don't wait for the realtime echo — large messages (photos, voice) can be slow
    // or get dropped over postgres_changes, so show your own message immediately.
    if (message) {
      setMessages((list) => (list.some((m) => m.id === message.id) ? list : [...list, message]));
      // Voice messages/stickers have no onLoad hook to re-trigger a scroll once their
      // real height settles (the waveform player, the audio element mounting), so — for
      // your own message specifically — force a few follow-up scrolls to catch it.
      stickBottomRef.current = true;
      scrollToEnd();
      [60, 200, 450, 800].forEach((delay) => setTimeout(scrollToEnd, delay));
    }
    setReplyTo(null);
    // Playful house rule: swearing costs 10 ₽, logged as a purchase against the sender
    // — reuses the existing purchases/leaderboard system instead of a silent word filter.
    if (extra.text && containsProfanity(extra.text)) {
      const { error: fineError } = await addPurchaseRow(user.phone, '🤬 Штраф за мат', 10);
      if (!fineError) {
        setSpamWarning('🤬 Штраф за мат — с тебя 10 ₽');
        setTimeout(() => setSpamWarning(''), 2000);
      }
    }
  }

  async function send() {
    if (!text.trim()) return;
    if (editingId) {
      const id = editingId;
      const value = text.trim();
      setMessages((list) => list.map((m) => (m.id === id ? { ...m, text: value, edited: true } : m)));
      editMessage(id, value);
      setEditingId(null);
      setText('');
      if (containsProfanity(value)) {
        const { error: fineError } = await addPurchaseRow(user.phone, '🤬 Штраф за мат', 10);
        if (!fineError) {
          setSpamWarning('🤬 Штраф за мат — с тебя 10 ₽');
          setTimeout(() => setSpamWarning(''), 2000);
        }
      }
      return;
    }
    pushMessage({ text: text.trim() });
    setText('');
  }

  function sendSticker(emoji) {
    pushMessage({ sticker: emoji });
    setStickersOpen(false);
  }

  function rollDice() {
    pushMessage({ dice: 1 + Math.floor(Math.random() * 6) });
    setStickersOpen(false);
  }

  async function handleGalleryFile(e) {
    const MAX_ALBUM_PHOTOS = 20;
    let files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;
    const photoCount = files.filter((f) => !f.type.startsWith('video/')).length;
    if (photoCount > MAX_ALBUM_PHOTOS) {
      setSpamWarning(`⚠️ Максимум ${MAX_ALBUM_PHOTOS} фото за раз — взял первые ${MAX_ALBUM_PHOTOS}`);
      setTimeout(() => setSpamWarning(''), 2500);
      let kept = 0;
      files = files.filter((f) => {
        if (f.type.startsWith('video/')) return true;
        kept += 1;
        return kept <= MAX_ALBUM_PHOTOS;
      });
    }
    setMediaUploading(true);
    const images = [];
    for (const file of files) {
      if (file.type.startsWith('video/')) {
        if (file.size > 8 * 1024 * 1024) {
          alert(`Видео "${file.name}" слишком большое — максимум 8 МБ`);
          continue;
        }
        const dataUrl = await fileToDataUrl(file);
        await pushMessage({ video: dataUrl });
      } else {
        images.push(await processImageFile(file, { square: false, maxSize: 900 }));
      }
    }
    // Two or more photos picked together land in one album message instead of
    // being split into separate bubbles — matches how every other messenger does it.
    if (images.length > 1) {
      await pushMessage({ images });
    } else if (images.length === 1) {
      await pushMessage({ image: images[0] });
    }
    setMediaUploading(false);
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function handleStickerUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const resized = await processImageFile(file, { square: true, maxSize: 180 });
    pushMessage({ image: resized, isSticker: true });
    setCustomStickers(addCustomSticker(resized));
    setStickersOpen(false);
    e.target.value = '';
  }

  function sendSavedSticker(image) {
    pushMessage({ image, isSticker: true });
    setStickersOpen(false);
  }

  function saveStickerFromMessage(m) {
    setCustomStickers(addCustomSticker(m.image));
    setMenuId(null);
  }

  function copyMessage(m) {
    const t = m.text || (m.sticker ? m.sticker : m.image ? '[фото]' : m.video ? '[видео]' : m.audio ? '[голосовое]' : '');
    navigator.clipboard?.writeText(t).catch(() => {});
    setMenuId(null);
  }

  function deleteMessage(id) {
    // Same reasoning as sending: don't wait on the realtime echo to confirm it.
    setMessages((list) => list.filter((m) => m.id !== id));
    dbDeleteMessage(id);
    setMenuId(null);
  }

  async function clearHistory() {
    if (!confirm('Удалить всю переписку в этом чате? Это удалит сообщения у всех участников и не отменяется.')) return;
    setMessages([]);
    await clearChatMessages(chat.id);
  }

  function startReply(m) {
    setReplyTo(m);
    setEditingId(null);
    setMenuId(null);
  }

  function startEdit(m) {
    setEditingId(m.id);
    setText(m.text || '');
    setReplyTo(null);
    setMenuId(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setText('');
  }

  function canDelete(m) {
    return m.authorPhone === user.phone || canManage;
  }

  function toggleReacting(messageId) {
    suppressResizeScrollRef.current = true;
    setStickersOpen(false);
    setMenuId(null);
    setReactingId((id) => (id === messageId ? null : messageId));
  }

  function toggleReaction(m, emoji) {
    const reactions = { ...(m.reactions || {}) };
    const reactedBy = { ...(m.reactedBy || {}) };
    const prev = reactedBy[user.phone];
    if (prev) {
      reactions[prev] = (reactions[prev] || 1) - 1;
      if (reactions[prev] <= 0) delete reactions[prev];
    }
    if (prev === emoji) {
      delete reactedBy[user.phone];
    } else {
      reactions[emoji] = (reactions[emoji] || 0) + 1;
      reactedBy[user.phone] = emoji;
    }
    updateMessageReactions(m.id, reactions, reactedBy);
    setReactingId(null);
  }

  function handleVote(message, index) {
    votePoll(message, index, user.phone, message.poll.multi);
  }

  async function startRecording(isRetry) {
    if (recording) return;
    setStickersOpen(false);
    setReactingId(null);
    stopRequestedRef.current = false;
    if (!navigator.mediaDevices?.getUserMedia) {
      alert('Микрофон недоступен в этом окне. Открой сайт по адресу http://localhost:5173 (не по IP телефона) — браузер разрешает запись звука только на localhost или https. В приложении на телефоне: разреши доступ к микрофону в настройках приложения.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (stopRequestedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const preferredType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'].find(
        (t) => window.MediaRecorder?.isTypeSupported?.(t)
      );
      const recorder = preferredType ? new MediaRecorder(stream, { mimeType: preferredType }) : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        clearInterval(recTimerRef.current);
        const tooShort = Date.now() - recordStartRef.current < 400;
        if (chunksRef.current.length === 0 || tooShort) return;
        // Use the recorder's own negotiated mime type — hardcoding one here can mismatch
        // the actual codec and make the browser refuse to play the result back.
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const reader = new FileReader();
        reader.onload = () => pushMessage({ audio: reader.result });
        reader.readAsDataURL(blob);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      recordStartRef.current = Date.now();
      setRecSeconds(0);
      recTimerRef.current = setInterval(() => {
        setRecSeconds(Math.floor((Date.now() - recordStartRef.current) / 1000));
      }, 250);
      setRecording(true);
    } catch (err) {
      // Right after Android's permission dialog is answered, the WebView's own
      // internal grant can lag a beat behind — one silent retry catches that instead
      // of showing "denied" when the user in fact just said yes.
      if (!isRetry && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) {
        setTimeout(() => startRecording(true), 600);
        return;
      }
      alert(
        `Нет доступа к микрофону (${err.name || 'ошибка'}${err.message ? ': ' + err.message : ''}).\n` +
        'Проверь в самом телефоне: Настройки → Приложения → Кенты → Разрешения → Микрофон должен быть включён. ' +
        'Если включён, но всё равно не работает — попробуй закрыть и заново открыть приложение.'
      );
    }
  }

  function stopRecording() {
    stopRequestedRef.current = true;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
  }

  function toggleRecording() {
    if (recording) stopRecording();
    else startRecording();
  }

  const scopeStyle = chat.accent ? { '--accent': chat.accent } : undefined;

  return (
    <div className="chatroom-scope" style={scopeStyle}>
      {/* A sibling of the scrollable .screen, not inside it — position: sticky
          inside a flex-item scroll container is a documented bug on older
          Chromium/WebView builds (the header would just scroll away with the
          messages). Living outside the scroll area entirely stays visible
          everywhere without depending on sticky positioning at all. */}
      <div className="chat-header">
        <button className="chat-back" onClick={onBack}>
          <span className="chat-back-icon">
            ← {chat.avatarImg ? <img className="avatar-img header-avatar-img" src={chat.avatarImg} alt="" /> : chat.emoji}
          </span>
          <span className="chat-back-text">
            <span className="chat-back-name">{chat.name}</span>
            {chat.isDM && otherPhone && <PresenceStatus phone={otherPhone} lastSeen={otherLastSeen} />}
          </span>
        </button>
        <div style={{ display: 'flex', gap: 6 }}>
          {!chat.isDM && (
            <button className="icon-btn small-icon-btn" title="Участники" onClick={() => setMembersOpen(true)}>👥</button>
          )}
          <button className="icon-btn small-icon-btn" title="Аудиозвонок" onClick={() => { setCallIsJoin(false); setInCall('audio'); }}>
            📞
          </button>
          <button className="icon-btn small-icon-btn" title="Видеозвонок" onClick={() => { setCallIsJoin(false); setInCall('video'); }}>
            🎥
          </button>
          <button className="icon-btn small-icon-btn" title="Настройки чата" onClick={() => setSettingsOpen((v) => !v)}>⚙️</button>
        </div>
      </div>
      <div className="screen" ref={screenRef} onScroll={handleScroll}>
        {settingsOpen && (
          <div className="card">
            {!chat.isDM && (
              <>
                <p className="sub" style={{ marginBottom: 6 }}>Название чата</p>
                <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                  <input className="field" value={chatNameDraft} onChange={(e) => setChatNameDraft(e.target.value)} disabled={!canManage} />
                  <button
                    className="btn small"
                    disabled={!canManage}
                    onClick={() => chatNameDraft.trim() && onUpdateChat(chat.id, { name: chatNameDraft.trim() })}
                  >
                    ОК
                  </button>
                </div>
                <p className="sub" style={{ marginBottom: 6 }}>Описание</p>
                <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                  <input
                    className="field"
                    placeholder="О чём эта группа?"
                    value={descDraft}
                    onChange={(e) => setDescDraft(e.target.value)}
                    disabled={!canManage}
                  />
                  <button className="btn small" disabled={!canManage} onClick={() => onUpdateChat(chat.id, { description: descDraft })}>
                    ОК
                  </button>
                </div>
              </>
            )}
            <p className="sub" style={{ marginBottom: 6 }}>Иконка чата</p>
            <div className="emoji-pick">
              {CHAT_EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  className={e === chat.emoji ? 'sel' : ''}
                  disabled={!chat.isDM && !canManage}
                  onClick={() => onUpdateChat(chat.id, { emoji: e })}
                >
                  {e}
                </button>
              ))}
            </div>
            <p className="sub" style={{ margin: '10px 0 6px' }}>Цвет чата</p>
            <div className="theme-pick">
              {ACCENT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="theme-chip"
                  style={{ borderColor: chat.accent === c ? c : undefined }}
                  onClick={() => onUpdateChat(chat.id, { accent: c })}
                >
                  <span className="theme-swatch" style={{ background: c }} />
                </button>
              ))}
              <button type="button" className="theme-chip" onClick={() => onUpdateChat(chat.id, { accent: null })}>
                Сброс
              </button>
            </div>
            {!chat.isDM && canManage && (
              <>
                <p className="sub" style={{ margin: '10px 0 6px' }}>Антиспам</p>
                <button
                  type="button"
                  className="theme-chip"
                  style={{ borderColor: chat.antispam ? 'var(--accent-2)' : undefined }}
                  onClick={() => onUpdateChat(chat.id, { antispam: !chat.antispam })}
                >
                  {chat.antispam ? '🛡 Включён (1 сообщение / 3 сек)' : '🛡 Выключен'}
                </button>
              </>
            )}
            {(chat.isDM || canManage) && (
              <button
                type="button"
                className="btn ghost small"
                style={{ marginTop: 14 }}
                onClick={clearHistory}
              >
                🧹 Очистить историю
              </button>
            )}
            {!chat.is_main && onLeaveChat && (
              <button
                type="button"
                className="btn ghost small"
                style={{ marginTop: 14, color: 'var(--danger)' }}
                onClick={() => {
                  const msg = chat.isDM ? 'Удалить этот чат?' : 'Покинуть группу?';
                  if (window.confirm(msg)) onLeaveChat(chat.id);
                }}
              >
                {chat.isDM ? '🗑 Удалить чат' : '🚪 Покинуть группу'}
              </button>
            )}
          </div>
        )}

        <div ref={contentRef}>
        {loading && <p className="sub">Загрузка сообщений...</p>}

        {!loading && (
          <div className="msg system">
            <div className="bubble">Чат создан. Верификация пройдена — тут только свои.</div>
          </div>
        )}

        {messages.filter((m) => m.system || !blockedPhones.includes(m.authorPhone)).map((m) => {
          if (m.system) {
            return (
              <div className="msg system" key={m.id}>
                <div className="bubble system-event">{m.text}</div>
              </div>
            );
          }
          const isMe = m.authorPhone === user.phone;
          const reactedByMe = m.reactedBy?.[user.phone];
          return (
            <div className={`msg ${isMe ? 'me' : ''}`} key={m.id} id={`msg-${m.id}`}>
              <div
                className="avatar-wrap"
                style={{ cursor: isMe ? 'default' : 'pointer' }}
                onClick={() =>
                  !isMe &&
                  setViewProfile({ id: m.authorPhone, phone: m.authorPhone, name: m.author, emoji: m.emoji, avatarImg: m.avatarImg })
                }
              >
                <div className="avatar">
                  {m.avatarImg ? <img className="avatar-img" src={m.avatarImg} alt="" /> : m.emoji}
                </div>
                {isMe && shameTag && <div className="shame-tag">{shameTag}</div>}
              </div>
              <div className="msg-col">
                <button type="button" className="msg-menu-btn" onClick={() => setMenuId(menuId === m.id ? null : m.id)}>
                  ⋯
                </button>
                {menuId === m.id && (
                  <div className="msg-menu">
                    <button onClick={() => startReply(m)}>↩️ Ответить</button>
                    <button onClick={() => toggleReacting(m.id)}>😊 Реакция</button>
                    <button onClick={() => copyMessage(m)}>📋 Скопировать</button>
                    {m.isSticker && <button onClick={() => saveStickerFromMessage(m)}>💾 Сохранить стикер</button>}
                    {isMe && m.text && !m.poll && <button onClick={() => startEdit(m)}>✏️ Редактировать</button>}
                    {canDelete(m) && <button onClick={() => deleteMessage(m.id)}>🗑 Удалить</button>}
                  </div>
                )}

                {m.sticker ? (
                  <div className="sticker-bubble" onClick={() => toggleReacting(m.id)}>
                    {m.sticker}
                  </div>
                ) : m.isSticker ? (
                  <img
                    className="sticker-image"
                    src={m.image}
                    alt=""
                    onLoad={scrollToEnd}
                    onClick={() => setLightbox(m.image)}
                  />
                ) : (
                  <div className="bubble" onClick={() => toggleReacting(m.id)}>
                    <div className="author">{m.author}</div>
                    {m.replyTo && (
                      <div className="reply-quote" onClick={(e) => { e.stopPropagation(); scrollToMessage(m.replyTo.id); }}>
                        <div>
                          <span className="reply-author">{m.replyTo.author}</span>
                          <span className="reply-text">{m.replyTo.text}</span>
                        </div>
                      </div>
                    )}
                    {m.image && (
                      <img
                        className="msg-image"
                        src={m.image}
                        alt=""
                        onLoad={scrollToEnd}
                        onClick={(e) => {
                          e.stopPropagation();
                          setLightbox({ images: [m.image], index: 0 });
                        }}
                      />
                    )}
                    {m.images && (
                      <div className={`msg-album count-${Math.min(m.images.length, 4)}`}>
                        {m.images.slice(0, 4).map((img, i) => (
                          <div
                            key={i}
                            className="msg-album-item"
                            onClick={(e) => {
                              e.stopPropagation();
                              // Tapping any thumbnail — including the 4th one under the
                              // "+N" overlay — opens the lightbox on the WHOLE album
                              // starting from that photo, not just the one tapped: there
                              // used to be no way to see photo 5+ at all, since only 4
                              // thumbnails ever rendered and the lightbox held one image.
                              setLightbox({ images: m.images, index: i });
                            }}
                          >
                            <img src={img} alt="" onLoad={scrollToEnd} />
                            {i === 3 && m.images.length > 4 && (
                              <div className="msg-album-more">+{m.images.length - 4}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {m.video && (
                      <video
                        className="msg-video"
                        src={m.video}
                        controls
                        preload="metadata"
                        onLoadedMetadata={scrollToEnd}
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                    {m.dice && (
                      <div className="dice-roll">
                        <span className="dice-face">{DICE_FACES[m.dice - 1]}</span>
                        <span className="dice-num">Выпало: {m.dice}</span>
                      </div>
                    )}
                    {m.audio && <VoiceMessage src={m.audio} id={m.id} />}
                    {m.poll && <PollMessage message={m} userPhone={user.phone} onVote={handleVote} />}
                    {m.text && <div className="text">{m.text}</div>}
                    <div className="time">
                      {m.time}
                      {m.edited && <span className="edited-tag">изменено</span>}
                    </div>
                  </div>
                )}

                {reactingId === m.id && (
                  <div className="reaction-picker">
                    {REACTIONS.map((r) => (
                      <button key={r} className="reaction-option" onClick={() => toggleReaction(m, r)}>
                        {r}
                      </button>
                    ))}
                  </div>
                )}

                {m.reactions && Object.keys(m.reactions).length > 0 && (
                  <div className="reaction-row">
                    {Object.entries(m.reactions).map(([e, c]) => (
                      <span
                        key={e}
                        className={`reaction-chip ${reactedByMe === e ? 'mine' : ''}`}
                        onClick={() => toggleReaction(m, e)}
                      >
                        {e} {c}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
        {/* The fixed input bar's top edge sits ~138px above the viewport bottom (its own
            height plus its own offset) — .screen's shared 90px padding alone left the last
            message(s) genuinely obscured behind it, not just visually tight. */}
        <div className="screen-spacer" />
        </div>
      </div>

      {stickersOpen && (
        <div className="sticker-panel">
          <button className="sticker-option" title="Кинуть кубик" onClick={rollDice}>🎲</button>
          {STICKERS.map((s) => (
            <button key={s} className="sticker-option" onClick={() => sendSticker(s)}>{s}</button>
          ))}
          {customStickers.map((img, i) => (
            <button key={i} className="sticker-option custom" onClick={() => sendSavedSticker(img)}>
              <img src={img} alt="" />
            </button>
          ))}
          <button className="sticker-option upload" onClick={() => fileInputRef.current?.click()}>+ свой</button>
          <input type="file" accept="image/*" ref={fileInputRef} style={{ display: 'none' }} onChange={handleStickerUpload} />
        </div>
      )}

      {spamWarning && <div className="toast">{spamWarning}</div>}

      {replyTo && (
        <div className="reply-preview-bar">
          <div className="reply-quote">
            <div>
              <span className="reply-author">Ответ {replyTo.author}</span>
              <span className="reply-text">{replyTo.text || replyTo.sticker || (replyTo.image ? '📷 Фото' : replyTo.audio ? '🎤 Голосовое' : '')}</span>
            </div>
          </div>
          <button onClick={() => setReplyTo(null)}>✕</button>
        </div>
      )}

      {editingId && (
        <div className="reply-preview-bar">
          <div className="reply-quote">
            <span className="reply-author">✏️ Редактирование сообщения</span>
          </div>
          <button onClick={cancelEdit}>✕</button>
        </div>
      )}

      {mediaUploading && (
        <div className="reply-preview-bar">
          <div className="reply-quote">
            <span className="reply-author">⏳ Загрузка...</span>
          </div>
        </div>
      )}

      <div className="chat-input-bar">
        <label className={`icon-btn ${mediaUploading ? 'disabled' : ''}`} title="Фото">
          🖼️
          <input
            type="file"
            accept="image/*,video/*"
            multiple
            disabled={mediaUploading}
            style={{ display: 'none' }}
            onChange={handleGalleryFile}
          />
        </label>
        <button
          className="icon-btn"
          title="Стикеры"
          onClick={() => {
            setReactingId(null);
            setStickersOpen((v) => !v);
          }}
        >
          🎨
        </button>
        {!chat.isDM && (
          <button className="icon-btn" title="Опрос" onClick={() => setPollOpen(true)}>📊</button>
        )}
        <input
          className="field"
          placeholder={editingId ? 'Изменить сообщение...' : 'Сообщение...'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
        />
        {text.trim() ? (
          <button className="send-btn" onClick={send}>➤</button>
        ) : (
          <button type="button" className={`send-btn mic-btn ${recording ? 'recording' : ''}`} onClick={toggleRecording}>
            {recording ? '⏹' : '🎤'}
          </button>
        )}
      </div>
      {recording && (
        <div className="rec-hint">
          ● {String(Math.floor(recSeconds / 60)).padStart(1, '0')}:{String(recSeconds % 60).padStart(2, '0')} — нажми ⏹, чтобы отправить
        </div>
      )}

      {newBelow > 0 && (
        <button className="new-below-pill" onClick={scrollToEnd}>
          ↓ {newBelow === 1 ? 'новое сообщение' : `новых сообщений: ${newBelow}`}
        </button>
      )}

      {inCall && <CallRoom user={user} chat={chat} video={inCall === 'video'} isJoin={callIsJoin} onClose={() => setInCall(null)} />}

      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          {lightbox.images.length > 1 && (
            <span className="lightbox-count">{lightbox.index + 1} / {lightbox.images.length}</span>
          )}
          {lightbox.index > 0 && (
            <button
              type="button"
              className="lightbox-nav lightbox-prev"
              onClick={(e) => {
                e.stopPropagation();
                setLightbox((lb) => ({ ...lb, index: lb.index - 1 }));
              }}
            >
              ‹
            </button>
          )}
          <img src={lightbox.images[lightbox.index]} alt="" onClick={(e) => e.stopPropagation()} />
          {lightbox.index < lightbox.images.length - 1 && (
            <button
              type="button"
              className="lightbox-nav lightbox-next"
              onClick={(e) => {
                e.stopPropagation();
                setLightbox((lb) => ({ ...lb, index: lb.index + 1 }));
              }}
            >
              ›
            </button>
          )}
        </div>
      )}

      {membersOpen && (
        <GroupMembers chat={chat} user={user} myRole={myRole} friends={friends} onClose={() => setMembersOpen(false)} />
      )}

      {pollOpen && <PollCreate onClose={() => setPollOpen(false)} onCreate={(poll) => { pushMessage({ poll }); setPollOpen(false); }} />}

      {viewProfile && (
        <FriendProfile
          friend={viewProfile}
          myPhone={user.phone}
          onClose={() => {
            setViewProfile(null);
            setBlockedPhones(getBlocked());
          }}
        />
      )}
    </div>
  );
}

const POLL_DURATIONS = [
  { label: 'Без ограничения', hours: null },
  { label: '1 час', hours: 1 },
  { label: '24 часа', hours: 24 },
];

function PollCreate({ onClose, onCreate }) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [multi, setMulti] = useState(false);
  const [duration, setDuration] = useState(POLL_DURATIONS[0]);

  function setOption(i, value) {
    setOptions((list) => list.map((o, idx) => (idx === i ? value : o)));
  }

  function addOption() {
    if (options.length < 6) setOptions((list) => [...list, '']);
  }

  function create() {
    const cleanOptions = options.map((o) => o.trim()).filter(Boolean);
    if (!question.trim() || cleanOptions.length < 2) return;
    const expiresAt = duration.hours ? new Date(Date.now() + duration.hours * 3600000).toISOString() : null;
    onCreate({ question: question.trim(), multi, expiresAt, options: cleanOptions.map((text) => ({ text, votes: [] })) });
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <h3>Новый опрос</h3>
        <input className="field" placeholder="Вопрос" value={question} onChange={(e) => setQuestion(e.target.value)} />
        {options.map((o, i) => (
          <input
            key={i}
            className="field"
            placeholder={`Вариант ${i + 1}`}
            value={o}
            onChange={(e) => setOption(i, e.target.value)}
          />
        ))}
        {options.length < 6 && (
          <button className="btn ghost small" onClick={addOption}>+ Вариант</button>
        )}
        <button className={`buyer-chip ${multi ? 'sel' : ''}`} type="button" onClick={() => setMulti((m) => !m)}>
          {multi ? '☑' : '☐'} Можно выбрать несколько
        </button>
        <p className="sub" style={{ margin: '10px 0 6px' }}>Длительность голосования</p>
        <div className="theme-pick">
          {POLL_DURATIONS.map((d) => (
            <button
              key={d.label}
              type="button"
              className={`theme-chip ${duration.label === d.label ? 'sel' : ''}`}
              onClick={() => setDuration(d)}
            >
              {d.label}
            </button>
          ))}
        </div>
        <button className="btn" onClick={create}>Создать опрос</button>
        <button className="btn ghost" onClick={onClose}>Отмена</button>
      </div>
    </div>
  );
}
