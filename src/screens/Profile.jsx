import { useState } from 'react';
import { loadState, saveState } from '../storage';
import { processImageFile } from '../utils/image';
import { upsertProfile, deleteProfile } from '../lib/db';
import Promises from '../components/Promises';

const EMOJIS = ['🦊', '🐱', '🐺', '🦉', '🐸', '🐼', '🐵', '🐧', '🦁', '🐨'];

const TIERS = [
  { min: 0, label: 'Free', emoji: '🆓' },
  { min: 3, label: 'Bronze', emoji: '🥉' },
  { min: 8, label: 'Silver', emoji: '🥈' },
  { min: 16, label: 'Gold', emoji: '🥇' },
  { min: 31, label: 'Platinum', emoji: '💎' },
];

function tierFor(score) {
  let current = TIERS[0];
  for (const t of TIERS) if (score >= t.min) current = t;
  return current;
}

const THEMES = [
  { id: 'dark', label: 'Тёмная', swatch: '#6c5ce7' },
  { id: 'light', label: 'Светлая', swatch: '#f4f4f9' },
  { id: 'purple', label: 'Фиолет', swatch: '#b76dff' },
  { id: 'cyberpunk', label: 'Киберпанк', swatch: '#00fff2' },
  { id: 'mint', label: 'Мята', swatch: '#2ee6a6' },
  { id: 'sunset', label: 'Закат', swatch: '#ff7a59' },
  { id: 'ocean', label: 'Океан', swatch: '#3aa6ff' },
];

export default function Profile({ user, onUpdate, friends, purchaseCount, theme, onThemeChange, onLogout, onDeleteAccount }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user.name);
  const [emoji, setEmoji] = useState(user.emoji);
  const [avatarImg, setAvatarImg] = useState(user.avatarImg || null);
  const [age, setAge] = useState(user.age || '');
  const [respect, setRespect] = useState(() => loadState('respect', {}));
  const [pop, setPop] = useState(null);

  function save() {
    const next = { ...user, name: name.trim() || user.name, emoji, avatarImg, age: age ? Number(age) : null };
    onUpdate(next);
    upsertProfile(next);
    setEditing(false);
  }

  async function handlePhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const cropped = await processImageFile(file, { square: true, maxSize: 400 });
    setAvatarImg(cropped);
    e.target.value = '';
  }

  function donate(friendId, friendName) {
    const next = { ...respect, [friendId]: (respect[friendId] || 0) + 1 };
    setRespect(next);
    saveState('respect', next);
    setPop(friendName);
    setTimeout(() => setPop(null), 1400);
  }

  const totalRespectGiven = Object.values(respect).reduce((a, b) => a + b, 0);
  const activityScore = purchaseCount + totalRespectGiven;
  const tier = tierFor(activityScore);
  const nextTier = TIERS.find((t) => t.min > activityScore);

  const badges = [];
  if (purchaseCount >= 1) badges.push('🛒 Первая покупка');
  if (purchaseCount >= 3) badges.push('👑 Спонсор месяца');
  if (totalRespectGiven >= 1) badges.push('🎉 Донатер');

  return (
    <div className="screen">
      <div className="profile-head">
        <div className="profile-avatar">
          {avatarImg ? <img className="profile-avatar-img" src={avatarImg} alt="" /> : emoji}
        </div>
        {editing ? (
          <>
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} style={{ textAlign: 'center', marginBottom: 10 }} />
            <input
              className="field"
              type="number"
              placeholder="Возраст"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              style={{ textAlign: 'center', marginBottom: 10 }}
            />
            <p className="sub">Эмодзи-аватарка:</p>
            <div className="emoji-pick">
              {EMOJIS.map((e) => (
                <button key={e} type="button" className={e === emoji ? 'sel' : ''} onClick={() => { setEmoji(e); setAvatarImg(null); }}>
                  {e}
                </button>
              ))}
            </div>
            <p className="sub">Или своё фото:</p>
            <label className="btn ghost small" style={{ display: 'inline-block' }}>
              📷 Загрузить фото
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhoto} />
            </label>
            {avatarImg && (
              <button className="btn ghost small" onClick={() => setAvatarImg(null)}>Убрать фото</button>
            )}
            <button className="btn small" onClick={save}>Сохранить</button>
          </>
        ) : (
          <>
            <div className="profile-name">{user.name}</div>
            <p className="sub">{user.phone}{user.age ? ` · ${user.age} лет` : ''}</p>
            <button className="btn ghost small" onClick={() => setEditing(true)}>Изменить профиль</button>
          </>
        )}
      </div>

      <div className="stat-row">
        <div className="stat-box">
          <div className="num">{purchaseCount}</div>
          <div className="lbl">покупок всего</div>
        </div>
        <div className="stat-box">
          <div className="num">{tier.emoji} {tier.label}</div>
          <div className="lbl">
            {nextTier ? `до ${nextTier.label}: ещё ${nextTier.min - activityScore}` : 'макс. тариф!'}
          </div>
        </div>
      </div>
      <p className="sub" style={{ marginTop: -8, marginBottom: 8 }}>
        Тариф растёт от активности (покупки + донаты), деньги никогда не нужны
      </p>

      <Promises friends={friends} />

      <div className="section-title">Тема оформления</div>
      <div className="theme-pick">
        {THEMES.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`theme-chip ${theme === t.id ? 'sel' : ''}`}
            onClick={() => onThemeChange(t.id)}
          >
            <span className="theme-swatch" style={{ background: t.swatch }} />
            {t.label}
          </button>
        ))}
      </div>

      <div className="section-title">Значки</div>
      <div className="badge-row">
        {badges.length ? badges.map((b) => <span className="badge" key={b}>{b}</span>) : <p className="sub">Пока пусто, покупай и донать</p>}
      </div>

      <div className="section-title">Задонатить другу (понарошку 🎉)</div>
      {friends.map((f) => (
        <div className="purchase-item" key={f.id}>
          <div className="emoji">{f.emoji}</div>
          <div className="info">
            <div className="title">{f.name}</div>
            <div className="meta">респект: {respect[f.id] || 0}</div>
          </div>
          <button className="btn small" onClick={() => donate(f.id, f.name)}>+1 🎉</button>
        </div>
      ))}

      <button className="btn ghost small" style={{ marginTop: 20 }} onClick={onLogout}>Выйти из аккаунта</button>
      <button
        className="btn ghost small"
        style={{ marginTop: 8, color: 'var(--danger)', borderColor: 'var(--danger)' }}
        onClick={() => {
          if (confirm('Удалить профиль насовсем? Это нельзя отменить.')) onDeleteAccount();
        }}
      >
        Удалить профиль
      </button>

      {pop && <div className="code-hint" style={{ position: 'fixed', bottom: 100, left: '50%', transform: 'translateX(-50%)' }}>🎉 Задонатил {pop}!</div>}
    </div>
  );
}
