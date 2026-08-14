import { useState } from 'react';
import { CHAT_EMOJIS } from '../data/chats';
import { getProfileByPhone, randomToken } from '../lib/db';
import { normalizePhone } from '../utils/phone';

function unreadLabel(n) {
  return n > 99 ? '+99' : String(n);
}

export default function ChatList({ chats, friends, onOpen, onCreate, onAddFriend, unreadCounts = {} }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('group');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [emoji, setEmoji] = useState(CHAT_EMOJIS[0]);
  const [pickedPhones, setPickedPhones] = useState([]);
  const [phone, setPhone] = useState('');
  const [phoneName, setPhoneName] = useState('');
  const [busy, setBusy] = useState(false);
  const [phoneError, setPhoneError] = useState('');

  function resetForm() {
    setName('');
    setDescription('');
    setEmoji(CHAT_EMOJIS[0]);
    setPickedPhones([]);
    setPhone('');
    setPhoneName('');
    setPhoneError('');
    setMode('group');
  }

  function togglePicked(phoneNum) {
    setPickedPhones((list) => (list.includes(phoneNum) ? list.filter((p) => p !== phoneNum) : [...list, phoneNum]));
  }

  function createGroup() {
    if (!name.trim()) return;
    onCreate({ name: name.trim(), emoji, description: description.trim() || null, memberPhones: pickedPhones });
    resetForm();
    setOpen(false);
  }

  function openWithFriend(friend) {
    onCreate({ name: friend.name, emoji: friend.emoji, isDM: true, memberPhone: friend.phone });
    resetForm();
    setOpen(false);
  }

  async function pickFromContacts() {
    if (!navigator.contacts?.select) {
      alert('Выбор из контактов телефона поддерживает только Chrome на Android — на компьютере или iPhone введи номер вручную.');
      return;
    }
    try {
      const picked = await navigator.contacts.select(['name', 'tel'], { multiple: false });
      if (picked.length > 0) {
        const c = picked[0];
        if (c.name?.[0]) setPhoneName(c.name[0]);
        if (c.tel?.[0]) setPhone(c.tel[0]);
      }
    } catch {
      // user cancelled the picker or denied permission — nothing to do
    }
  }

  async function createByPhone() {
    if (!phone.trim() || !phoneName.trim() || busy) return;
    setBusy(true);
    setPhoneError('');
    const normalized = normalizePhone(phone);
    const existingProfile = await getProfileByPhone(normalized);
    if (!existingProfile) {
      // Used to fall back to a made-up local contact here — one mistyped digit silently
      // created a permanent fake "friend" that then showed up in the purchases
      // leaderboard as an always-offline 0 ₽ ghost. Refuse instead: this is a closed
      // group for verified people, so only registered phones can be added.
      setBusy(false);
      setPhoneError('Этот номер ещё не зарегистрирован в Кентах — попроси человека сначала зайти в приложение');
      return;
    }
    const friend = { id: randomToken(), name: existingProfile.name, emoji: existingProfile.emoji, phone: normalized };
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
            <div className="avatar">
              {c.avatarImg ? <img className="avatar-img" src={c.avatarImg} alt="" /> : c.emoji}
            </div>
            <div className="info">
              <div className="title">{c.is_dm ? '👤 ' : '👥 '}{c.name}</div>
              <div className="meta">{c.is_dm ? 'Личный чат' : 'Групповой чат'}</div>
            </div>
            {!!unreadCounts[c.id] && <span className="unread-badge">{unreadLabel(unreadCounts[c.id])}</span>}
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
                <input
                  className="field"
                  placeholder="Описание группы (необязательно)"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
                <div className="emoji-pick">
                  {CHAT_EMOJIS.map((e) => (
                    <button key={e} type="button" className={e === emoji ? 'sel' : ''} onClick={() => setEmoji(e)}>
                      {e}
                    </button>
                  ))}
                </div>
                {friends.length > 0 && (
                  <>
                    <p className="sub">Добавить участников:</p>
                    <div className="buyer-pick">
                      {friends.filter((f) => f.phone).map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          className={`buyer-chip ${pickedPhones.includes(f.phone) ? 'sel' : ''}`}
                          onClick={() => togglePicked(f.phone)}
                        >
                          {f.emoji} {f.name}
                        </button>
                      ))}
                    </div>
                  </>
                )}
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
                <button className="btn ghost small" onClick={pickFromContacts}>📇 Выбрать из контактов</button>
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
                  onChange={(e) => { setPhone(e.target.value); setPhoneError(''); }}
                />
                {phoneError && <p className="sub" style={{ color: 'var(--danger)' }}>{phoneError}</p>}
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
