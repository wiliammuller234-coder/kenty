import { useEffect, useState } from 'react';
import { getChatMembers, addChatMembers, removeChatMember, setMemberRole, postSystemMessage } from '../lib/db';

const ROLE_LABEL = { owner: '👑 Владелец', admin: '🛡️ Админ', member: 'Участник' };

export default function GroupMembers({ chat, user, myRole, friends, onClose }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const canManage = myRole === 'owner' || myRole === 'admin';

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setMembers(await getChatMembers(chat.id));
    setLoading(false);
  }

  async function promote(phone) {
    await setMemberRole(chat.id, phone, 'admin');
    await postSystemMessage(chat.id, `${nameOf(phone)} назначен(а) администратором`);
    load();
  }

  async function demote(phone) {
    await setMemberRole(chat.id, phone, 'member');
    load();
  }

  async function remove(phone) {
    if (!confirm('Удалить участника из группы?')) return;
    await removeChatMember(chat.id, phone);
    await postSystemMessage(chat.id, `${nameOf(phone)} удалён(а) из группы`);
    load();
  }

  function nameOf(phone) {
    return members.find((m) => m.phone === phone)?.profile.name || phone;
  }

  async function addFriend(friend) {
    if (!friend.phone) return;
    await addChatMembers(chat.id, [friend.phone]);
    await postSystemMessage(chat.id, `${friend.name} присоединился(ась) к группе`);
    load();
  }

  const memberPhones = new Set(members.map((m) => m.phone));
  const addableFriends = friends.filter((f) => f.phone && !memberPhones.has(f.phone));

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <h3>Участники группы</h3>
        {loading && <p className="sub">Загрузка...</p>}
        {!loading &&
          members.map((m) => (
            <div className="purchase-item" key={m.phone}>
              <div className="emoji">{m.profile.avatarImg ? <img className="avatar-img" src={m.profile.avatarImg} alt="" /> : m.profile.emoji}</div>
              <div className="info">
                <div className="title">{m.profile.name}{m.phone === user.phone ? ' (ты)' : ''}</div>
                <div className="meta">{ROLE_LABEL[m.role] || m.role}</div>
              </div>
              {canManage && m.phone !== user.phone && m.role !== 'owner' && (
                <div style={{ display: 'flex', gap: 4 }}>
                  {m.role === 'admin' ? (
                    <button className="repeat-btn" title="Снять админа" onClick={() => demote(m.phone)}>⬇️</button>
                  ) : (
                    <button className="repeat-btn" title="Сделать админом" onClick={() => promote(m.phone)}>⬆️</button>
                  )}
                  <button className="repeat-btn" title="Удалить" onClick={() => remove(m.phone)}>🗑</button>
                </div>
              )}
            </div>
          ))}

        {canManage && (
          <>
            <div className="section-title">Добавить участника</div>
            {!adding && (
              <button className="btn ghost small" onClick={() => setAdding(true)}>+ Добавить из друзей</button>
            )}
            {adding && (
              <div className="buyer-pick">
                {addableFriends.map((f) => (
                  <button key={f.id} type="button" className="buyer-chip" onClick={() => addFriend(f)}>
                    {f.emoji} {f.name}
                  </button>
                ))}
                {addableFriends.length === 0 && <span className="sub">Все друзья уже в группе</span>}
              </div>
            )}
          </>
        )}

        <button className="btn ghost" onClick={onClose}>Закрыть</button>
      </div>
    </div>
  );
}
