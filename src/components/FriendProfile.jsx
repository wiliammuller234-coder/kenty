import { loadState } from '../storage';

export default function FriendProfile({ friend, onClose }) {
  const purchases = loadState('purchases', []);
  const respect = loadState('respect', {});
  const total = purchases.filter((p) => p.buyerId === friend.id).reduce((sum, p) => sum + p.amount, 0);
  const count = purchases.filter((p) => p.buyerId === friend.id).length;
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

        <button className="btn ghost" style={{ marginTop: 16 }} onClick={onClose}>Закрыть</button>
      </div>
    </div>
  );
}
