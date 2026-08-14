import { useEffect, useMemo, useState } from 'react';
import FriendProfile from '../components/FriendProfile';
import { getMainChatMembers, randomToken } from '../lib/db';

const EMOJIS = ['🦊', '🐱', '🐺', '🦉', '🐸', '🐼', '🐵', '🐧', '🦁', '🐨'];

function daysUntil(mmdd) {
  const [mm, dd] = mmdd.split('-').map(Number);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let target = new Date(now.getFullYear(), mm - 1, dd);
  if (target < today) target = new Date(now.getFullYear() + 1, mm - 1, dd);
  return Math.round((target - today) / 86400000);
}

function formatDate(mmdd) {
  const [mm, dd] = mmdd.split('-');
  const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  return `${Number(dd)} ${months[Number(mm) - 1]}`;
}

export default function Birthdays({ user, friends, onAddFriend, onRemoveFriend, onCongratulate }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [viewProfile, setViewProfile] = useState(null);
  const [groupMembers, setGroupMembers] = useState([]);

  useEffect(() => {
    if (!user) return;
    getMainChatMembers(user.phone).then((members) =>
      setGroupMembers(
        members
          .filter((m) => m.profile.birthday)
          .map((m) => ({
            id: m.phone,
            name: m.phone === user.phone ? `${m.profile.name} (ты)` : m.profile.name,
            emoji: m.profile.emoji,
            avatarImg: m.profile.avatarImg,
            phone: m.phone,
            birthday: m.profile.birthday,
          }))
      )
    );
  }, [user]);

  // Everyone in the shared group shows up automatically from their registration
  // date — merged with locally-added friends who aren't in the group (or have no phone).
  const allPeople = useMemo(() => {
    const byPhone = new Map();
    for (const f of friends) if (f.birthday) byPhone.set(f.phone || f.id, f);
    for (const m of groupMembers) byPhone.set(m.phone, m);
    return [...byPhone.values()];
  }, [friends, groupMembers]);

  const withDays = useMemo(
    () =>
      allPeople
        .filter((f) => f.birthday)
        .map((f) => ({ ...f, days: daysUntil(f.birthday) }))
        .sort((a, b) => a.days - b.days),
    [allPeople]
  );

  const todays = withDays.filter((f) => f.days === 0);
  const closest = withDays[0];

  function addFriend() {
    if (!name.trim() || !date) return;
    onAddFriend({
      id: randomToken(),
      name: name.trim(),
      emoji: EMOJIS[Math.floor(Math.random() * EMOJIS.length)],
      birthday: date.slice(5),
    });
    setName('');
    setDate('');
    setOpen(false);
  }

  return (
    <>
      <div className="screen">
        {todays.length > 0 ? (
          <div className="bday-hero">
            <div>🎉🎂🎉</div>
            <div className="who">
              Сегодня ДР у {todays.map((f) => `${f.emoji} ${f.name}`).join(', ')}!
            </div>
            <div className="sub">Не забудь поздравить</div>
            {todays.filter((f) => f.phone !== user.phone).map((f) => (
              <button key={f.id} className="btn small" style={{ marginTop: 10 }} onClick={() => onCongratulate(f)}>
                🎉 Поздравить {f.name} в чате
              </button>
            ))}
          </div>
        ) : closest ? (
          <div className="bday-hero">
            <div className="label">Ближайший день рождения</div>
            <div className="who">{closest.emoji} {closest.name}</div>
            <div className="sub">через {closest.days} {plural(closest.days)}, {formatDate(closest.birthday)}</div>
          </div>
        ) : null}

        <div className="section-title">Все дни рождения</div>
        {withDays.map((f) => (
          <div className="bday-item" key={f.id}>
            <div
              className="emoji"
              style={{ cursor: f.phone !== user.phone ? 'pointer' : 'default' }}
              onClick={() => f.phone !== user.phone && setViewProfile(f)}
            >
              {f.emoji}
            </div>
            <div
              className="info"
              style={{ cursor: f.phone !== user.phone ? 'pointer' : 'default' }}
              onClick={() => f.phone !== user.phone && setViewProfile(f)}
            >
              <div className="name">{f.name}</div>
              <div className="date">{formatDate(f.birthday)}</div>
            </div>
            <div className="days">{f.days === 0 ? 'сегодня!' : `через ${f.days} ${plural(f.days)}`}</div>
            {f.phone !== user.phone && (
              <button className="repeat-btn" title="Поздравить в чате" onClick={() => onCongratulate(f)}>🎉</button>
            )}
          </div>
        ))}
        <div className="screen-spacer" />
      </div>

      <button className="fab" onClick={() => setOpen(true)}>+</button>

      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <h3>Добавить день рождения</h3>
            <input
              className="field"
              placeholder="Имя друга"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              className="field"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            <button className="btn" onClick={addFriend}>Добавить</button>
            <button className="btn ghost" onClick={() => setOpen(false)}>Отмена</button>
          </div>
        </div>
      )}

      {viewProfile && <FriendProfile friend={viewProfile} myPhone={user.phone} onClose={() => setViewProfile(null)} onRemove={onRemoveFriend} />}
    </>
  );
}

function plural(n) {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return 'дней';
  if (last === 1) return 'день';
  if (last >= 2 && last <= 4) return 'дня';
  return 'дней';
}
