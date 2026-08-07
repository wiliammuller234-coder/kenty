import { useState } from 'react';
import { CHAT_EMOJIS } from '../data/chats';
import { getProfileByPhone } from '../lib/db';
import { normalizePhone } from '../utils/phone';

const CONTACT_EMOJIS = ['🙂', '😺', '🐶', '🦁', '🐨', '🦊', '🐼', '🐧'];

export default function ChatList({ chats, friends, onOpen, onCreate, onAddFriend }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('group');
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(CHAT_EMOJIS[0]);
  const [phone, setPhone] = useState('');
  const [phoneName, setPhoneName] = useState('');
  const [busy, setBusy] = useState(false);

  function resetForm() {
    setName('');
    setEmoji(CHAT_EMOJIS[0]);
    setPhone('');
    setPhoneName('');
    setMode('group');
  }

  function createGroup() {
    if (!name.trim()) return;
    onCreate({ name: name.trim(), emoji });
    resetForm();
    setOpen(false);
  }

  function openWithFriend(friend) {
    onCreate({ name: friend.name, emoji: friend.emoji, isDM: true, memberPhone: friend.phone });
    resetForm();
    setOpen(false);
  }

  async function createByPhone() {
    if (!phone.trim() || !phoneName.trim() || busy) return;
    setBusy(true);
    const normalized = normalizePhone(phone);
    const existingProfile = await getProfileByPhone(normalized);
    const friend = existingProfile
      ? { id: crypto.randomUUID(), name: existingProfile.name, emoji: existingProfile.emoji, phone: normalized }
      : {
          id: crypto.randomUUID(),
          name: phoneName.trim(),
          emoji: CONTACT_EMOJIS[Math.floor(Math.random() * CONTACT_EMOJIS.length)],
          phone: normalized,
        };
    onAddFriend(friend);
    onCreate({ name: friend.name, emoji: friend.emoji, isDM: true, memberPhone: normalized });
    setBusy(false);
    resetForm();
    setOpen(false);
  }

  return (
    <>
      <div className="screen">
        {chats.map((c) => (
          <button className="chat-list-item" key={c.id} onClick={() => onOpen(c.id)}>
            <div className="avatar">{c.emoji}</div>
            <div className="info">
              <div className="title">{c.is_dm ? '👤 ' : '👥 '}{c.name}</div>
              <div className="meta">{c.is_dm ? 'Личный чат' : 'Групповой чат'}</div>
            </div>
          </button>
        ))}
        {chats.length === 0 && <p className="sub">Пока нет чатов — создай первый</p>}
        <div className="screen-spacer" />
      </div>

      <button className="fab" onClick={() => setOpen(true)}>+</button>

      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <h3>Новый чат</h3>
            <div className="buyer-pick">
              <button
                type="button"
                className={`buyer-chip ${mode === 'group' ? 'sel' : ''}`}
                onClick={() => setMode('group')}
              >
                👥 Групповой
              </button>
              <button
                type="button"
                className={`buyer-chip ${mode === 'dm' ? 'sel' : ''}`}
                onClick={() => setMode('dm')}
              >
                👤 Личный
              </button>
            </div>

            {mode === 'group' ? (
              <>
                <input
                  className="field"
                  placeholder="Название (например, Дача)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <div className="emoji-pick">
                  {CHAT_EMOJIS.map((e) => (
                    <button key={e} type="button" className={e === emoji ? 'sel' : ''} onClick={() => setEmoji(e)}>
                      {e}
                    </button>
                  ))}
                </div>
                <button className="btn" onClick={createGroup}>Создать</button>
              </>
            ) : (
              <>
                <p className="sub">Выбери друга:</p>
                <div className="buyer-pick">
                  {friends.map((f) => (
                    <button key={f.id} type="button" className="buyer-chip" onClick={() => openWithFriend(f)}>
                      {f.emoji} {f.name}
                    </button>
                  ))}
                  {friends.length === 0 && <span className="sub">Пока нет друзей</span>}
                </div>
                <p className="sub" style={{ marginTop: 8 }}>Или добавь по номеру телефона:</p>
                <input
                  className="field"
                  placeholder="Имя контакта"
                  value={phoneName}
                  onChange={(e) => setPhoneName(e.target.value)}
                />
                <input
                  className="field"
                  type="tel"
                  placeholder="+7 900 000-00-00"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
                <button className="btn" onClick={createByPhone} disabled={busy}>
                  {busy ? 'Ищу...' : 'Написать'}
                </button>
              </>
            )}
            <button className="btn ghost" onClick={() => { resetForm(); setOpen(false); }}>Отмена</button>
          </div>
        </div>
      )}
    </>
  );
}
