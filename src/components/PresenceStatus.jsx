import { useEffect, useState } from 'react';
import { isOnline, subscribePresence } from '../lib/presence';

export default function PresenceStatus({ phone, lastSeen, dotOnly }) {
  const [online, setOnline] = useState(isOnline(phone));

  useEffect(() => subscribePresence((set) => setOnline(set.has(phone))), [phone]);

  if (dotOnly) return <span className={`presence-dot ${online ? 'online' : ''}`} />;

  return (
    <span className="presence-text">
      <span className={`presence-dot ${online ? 'online' : ''}`} />
      {online ? 'В сети' : formatLastSeen(lastSeen)}
    </span>
  );
}

function formatLastSeen(lastSeen) {
  if (!lastSeen) return 'не в сети';
  const date = new Date(lastSeen);
  const now = new Date();
  const minutes = Math.floor((now - date) / 60000);

  if (minutes < 1) return 'был(а) только что';
  if (minutes < 60) return `был(а) ${minutes} ${pluralMin(minutes)} назад`;

  const hours = Math.floor(minutes / 60);
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) return `был(а) ${hours} ${pluralHour(hours)} назад`;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const time = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  if (date.toDateString() === yesterday.toDateString()) return `был(а) вчера в ${time}`;

  const days = Math.floor((now.setHours(0, 0, 0, 0) - new Date(date).setHours(0, 0, 0, 0)) / 86400000);
  if (days < 7) return `был(а) ${days} ${pluralDay(days)} назад`;
  return `был(а) ${date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}`;
}

function pluralMin(n) {
  const l = n % 10;
  if (n % 100 > 10 && n % 100 < 20) return 'минут';
  if (l === 1) return 'минуту';
  if (l >= 2 && l <= 4) return 'минуты';
  return 'минут';
}

function pluralHour(n) {
  const l = n % 10;
  if (n % 100 > 10 && n % 100 < 20) return 'часов';
  if (l === 1) return 'час';
  if (l >= 2 && l <= 4) return 'часа';
  return 'часов';
}

function pluralDay(n) {
  const l = n % 10;
  if (n % 100 > 10 && n % 100 < 20) return 'дней';
  if (l === 1) return 'день';
  if (l >= 2 && l <= 4) return 'дня';
  return 'дней';
}
