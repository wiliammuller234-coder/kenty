import { useEffect, useRef, useState } from 'react';
import { STICKERS } from '../data/stickers';
import { CHAT_EMOJIS } from '../data/chats';
import { processImageFile } from '../utils/image';
import { getShameTag } from '../utils/promises';
import { loadState } from '../storage';
import { getMessages, sendMessage, subscribeToChat, updateMessageReactions, deleteMessage as dbDeleteMessage } from '../lib/db';
import VoiceMessage from './VoiceMessage';
import CallRoom from './CallRoom';

const ACCENT_COLORS = ['#6c5ce7', '#00d9a3', '#ff7a59', '#3aa6ff', '#ff2ec4', '#2ee6a6'];
const REACTIONS = ['❤️', '👍', '😂', '😮', '😢'];

export default function ChatRoom({ user, chat, onBack, onUpdateChat }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [stickersOpen, setStickersOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [reactingId, setReactingId] = useState(null);
  const [menuId, setMenuId] = useState(null);
  const [chatNameDraft, setChatNameDraft] = useState(chat.name);
  const [inCall, setInCall] = useState(false);
  const shameTag = getShameTag(loadState('promises', []));
  const endRef = useRef(null);
  const screenRef = useRef(null);
  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const stopRequestedRef = useRef(false);
  const recordStartRef = useRef(0);
  const [recSeconds, setRecSeconds] = useState(0);
  const recTimerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
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
    };
  }, [chat.id]);

  useEffect(() => {
    scrollToEnd();
  }, [messages]);

  useEffect(() => {
    // Catches any layout shift after the initial scroll — images/stickers/voice bars
    // that finish loading a moment later used to leave the view stuck mid-way.
    const container = screenRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => scrollToEnd());
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  function scrollToEnd() {
    endRef.current?.scrollIntoView({ block: 'end' });
  }

  async function pushMessage(extra) {
    const { message } = await sendMessage(chat.id, {
      authorPhone: user.phone,
      author: user.name,
      emoji: user.emoji,
      avatarImg: user.avatarImg || null,
      ...extra,
    });
    // Don't wait for the realtime echo — large messages (photos, voice) can be slow
    // or get dropped over postgres_changes, so show your own message immediately.
    if (message) {
      setMessages((list) => (list.some((m) => m.id === message.id) ? list : [...list, message]));
    }
  }

  function send() {
    if (!text.trim()) return;
    pushMessage({ text: text.trim() });
    setText('');
  }

  function sendSticker(emoji) {
    pushMessage({ sticker: emoji });
    setStickersOpen(false);
  }

  async function handleGalleryFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const resized = await processImageFile(file, { square: false, maxSize: 900 });
    pushMessage({ image: resized });
    e.target.value = '';
  }

  async function handleStickerUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const resized = await processImageFile(file, { square: true, maxSize: 180 });
    pushMessage({ image: resized, isSticker: true });
    setStickersOpen(false);
    e.target.value = '';
  }

  function copyMessage(m) {
    const t = m.text || (m.sticker ? m.sticker : m.image ? '[фото]' : m.audio ? '[голосовое]' : '');
    navigator.clipboard?.writeText(t).catch(() => {});
    setMenuId(null);
  }

  function deleteMessage(id) {
    // Same reasoning as sending: don't wait on the realtime echo to confirm it.
    setMessages((list) => list.filter((m) => m.id !== id));
    dbDeleteMessage(id);
    setMenuId(null);
  }

  function toggleReacting(messageId) {
    setStickersOpen(false);
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

  async function startRecording() {
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
    } catch {
      alert('Нет доступа к микрофону — разреши запись в настройках браузера/приложения.');
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
      <div className="screen" ref={screenRef}>
        <div className="chat-header">
          <button className="chat-back" onClick={onBack}>← {chat.emoji} {chat.name}</button>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="icon-btn small-icon-btn" title="Групповой звонок" onClick={() => setInCall(true)}>
              📞
            </button>
            <button className="icon-btn small-icon-btn" title="Настройки чата" onClick={() => setSettingsOpen((v) => !v)}>⚙️</button>
          </div>
        </div>

        {settingsOpen && (
          <div className="card">
            {!chat.isDM && (
              <>
                <p className="sub" style={{ marginBottom: 6 }}>Название чата</p>
                <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                  <input className="field" value={chatNameDraft} onChange={(e) => setChatNameDraft(e.target.value)} />
                  <button
                    className="btn small"
                    onClick={() => chatNameDraft.trim() && onUpdateChat(chat.id, { name: chatNameDraft.trim() })}
                  >
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
          </div>
        )}

        {loading && <p className="sub">Загрузка сообщений...</p>}

        {!loading && (
          <div className="msg system">
            <div className="bubble">Чат создан. Верификация пройдена — тут только свои.</div>
          </div>
        )}

        {messages.map((m) => {
          const isMe = m.authorPhone === user.phone;
          const reactedByMe = m.reactedBy?.[user.phone];
          return (
            <div className={`msg ${isMe ? 'me' : ''}`} key={m.id}>
              <div className="avatar-wrap">
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
                    <button onClick={() => copyMessage(m)}>📋 Скопировать</button>
                    <button onClick={() => deleteMessage(m.id)}>🗑 Удалить</button>
                  </div>
                )}

                {m.sticker ? (
                  <div className="sticker-bubble" onClick={() => toggleReacting(m.id)}>
                    {m.sticker}
                  </div>
                ) : m.isSticker ? (
                  <img className="sticker-image" src={m.image} alt="" onLoad={scrollToEnd} onClick={() => toggleReacting(m.id)} />
                ) : (
                  <div className="bubble" onClick={() => toggleReacting(m.id)}>
                    <div className="author">{m.author}</div>
                    {m.image && <img className="msg-image" src={m.image} alt="" onLoad={scrollToEnd} />}
                    {m.audio && <VoiceMessage src={m.audio} id={m.id} />}
                    {m.text && <div className="text">{m.text}</div>}
                    <div className="time">{m.time}</div>
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
      </div>

      {stickersOpen && (
        <div className="sticker-panel">
          {STICKERS.map((s) => (
            <button key={s} className="sticker-option" onClick={() => sendSticker(s)}>{s}</button>
          ))}
          <button className="sticker-option upload" onClick={() => fileInputRef.current?.click()}>+ свой</button>
          <input type="file" accept="image/*" ref={fileInputRef} style={{ display: 'none' }} onChange={handleStickerUpload} />
        </div>
      )}

      <div className="chat-input-bar">
        <label className="icon-btn" title="Фото">
          🖼️
          <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleGalleryFile} />
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
        <input
          className="field"
          placeholder="Сообщение..."
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

      {inCall && <CallRoom user={user} chat={chat} onClose={() => setInCall(false)} />}
    </div>
  );
}
