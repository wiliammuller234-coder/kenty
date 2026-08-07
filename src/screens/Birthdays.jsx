import { useMemo, useState } from 'react';
import FriendProfile from '../components/FriendProfile';

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

export default function Birthdays({ friends, onAddFriend, onCongratulate }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [viewProfile, setViewProfile] = useState(null);

  const withDays = useMemo(
    () =>
      friends
        .filter((f) => f.birthday)
        .map((f) => ({ ...f, days: daysUntil(f.birthday) }))
        .sort((a, b) => a.days - b.days),
    [friends]
  );

  const todays = withDays.filter((f) => f.days === 0);
  const closest = withDays[0];

  function addFriend() {
    if (!name.trim() || !date) return;
    onAddFriend({
      id: crypto.randomUUID(),
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
            {todays.map((f) => (
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
            <div className="emoji" style={{ cursor: 'pointer' }} onClick={() => setViewProfile(f)}>{f.emoji}</div>
            <div className="info" style={{ cursor: 'pointer' }} onClick={() => setViewProfile(f)}>
              <div className="name">{f.name}</div>
              <div className="date">{formatDate(f.birthday)}</div>
            </div>
            <div className="days">{f.days === 0 ? 'сегодня!' : `через ${f.days} ${plural(f.days)}`}</div>
            <button className="repeat-btn" title="Поздравить в чате" onClick={() => onCongratulate(f)}>🎉</button>
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

      {viewProfile && <FriendProfile friend={viewProfile} onClose={() => setViewProfile(null)} />}
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
