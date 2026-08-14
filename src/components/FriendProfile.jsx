import { useEffect, useState } from 'react';
import { loadState } from '../storage';
import { isBlocked, toggleBlock } from '../utils/blocked';
import { isFamily, toggleFamily } from '../utils/family';
import { getGroupPurchases } from '../lib/db';

export default function FriendProfile({ friend, myPhone, onClose, onRemove }) {
  const [blocked, setBlocked] = useState(() => (friend.phone ? isBlocked(friend.phone) : false));
  const [family, setFamily] = useState(false);
  const [purchases, setPurchases] = useState([]);
  const respect = loadState('respect', {});

  useEffect(() => {
    if (!friend.phone) return;
    getGroupPurchases([friend.phone]).then(setPurchases);
  }, [friend.phone]);

  useEffect(() => {
    if (!friend.phone || !myPhone) return;
    isFamily(myPhone, friend.phone).then(setFamily);
  }, [friend.phone, myPhone]);

  const total = purchases.reduce((sum, p) => sum + p.amount, 0);
  const count = purchases.length;
  const respectCount = respect[friend.id] || 0;

  const badges = [];
  if (count >= 1) badges.push('🛒 Первая покупка');
  if (count >= 3) badges.push('👑 Спонсор месяца');
  if (respectCount >= 1) badges.push('🎉 Донатер');

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="profile-head" style={{ padding: '4px 0 16px' }}>
          <div className="profile-avatar">
            {friend.avatarImg ? <img className="profile-avatar-img" src={friend.avatarImg} alt="" /> : friend.emoji}
          </div>
          <div className="profile-name">{friend.name}</div>
          {friend.phone && <p className="sub">{friend.phone}</p>}
        </div>

        <div className="stat-row">
          <div className="stat-box">
            <div className="num">{total} ₽</div>
            <div className="lbl">потрачено всего</div>
          </div>
          <div className="stat-box">
            <div className="num">{respectCount}</div>
            <div className="lbl">респект от тебя</div>
          </div>
        </div>

        <div className="section-title" style={{ marginTop: 4 }}>Значки</div>
        <div className="badge-row">
          {badges.length ? badges.map((b) => <span className="badge" key={b}>{b}</span>) : <p className="sub">Пока пусто</p>}
        </div>

        {friend.phone && myPhone && (
          <button
            className="btn ghost"
            style={{ marginTop: 16, borderColor: family ? 'var(--accent-2)' : undefined, color: family ? 'var(--accent-2)' : undefined }}
            onClick={() => toggleFamily(myPhone, friend.phone).then((list) => setFamily(list.includes(friend.phone)))}
          >
            {family ? '👨‍👩‍👧 В семье — покупки делятся с ним автоматически' : '👨‍👩‍👧 Отметить как семью'}
          </button>
        )}
        {friend.phone && (
          <button
            className="btn ghost"
            style={{ marginTop: 8, color: blocked ? undefined : 'var(--danger)' }}
            onClick={() => setBlocked(toggleBlock(friend.phone).includes(friend.phone))}
          >
            {blocked ? '✅ Разблокировать' : '🚫 Заблокировать'}
          </button>
        )}
        {onRemove && (
          <button
            className="btn ghost"
            style={{ marginTop: 8, color: 'var(--danger)' }}
            onClick={() => {
              if (confirm(`Удалить контакт «${friend.name}»? Это не удалит настоящий аккаунт, если он есть — только вручную добавленную запись.`)) {
                onRemove(friend);
                onClose();
              }
            }}
          >
            🗑 Удалить контакт
          </button>
        )}
        <button className="btn ghost" style={{ marginTop: 8 }} onClick={onClose}>Закрыть</button>
      </div>
    </div>
  );
}
