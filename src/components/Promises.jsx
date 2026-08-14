import { useEffect, useState } from 'react';
import { getMainChatMembers, getGroupPromises, addPromiseRow, updatePromiseRow, subscribeToPromises } from '../lib/db';
import { isOverdue } from '../utils/promises';

export default function Promises({ user }) {
  const [promises, setPromises] = useState([]);
  const [people, setPeople] = useState({});
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [deadline, setDeadline] = useState('');

  useEffect(() => {
    let cancelled = false;
    getMainChatMembers(user.phone).then((members) => {
      if (cancelled) return;
      const peopleMap = { [user.phone]: { name: user.name, emoji: user.emoji } };
      for (const m of members) peopleMap[m.phone] = { name: m.profile.name, emoji: m.profile.emoji };
      setPeople(peopleMap);
      const phones = Object.keys(peopleMap);
      getGroupPromises(phones).then((rows) => {
        if (!cancelled) setPromises(rows);
      });
    });
    const unsubscribe = subscribeToPromises((type, payload) => {
      setPromises((list) => {
        if (type === 'INSERT') return list.some((p) => p.id === payload.id) ? list : [...list, payload];
        if (type === 'UPDATE') return list.map((p) => (p.id === payload.id ? payload : p));
        if (type === 'DELETE') return list.filter((p) => p.id !== payload);
        return list;
      });
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [user.phone, user.name, user.emoji]);

  function nameOf(phone) {
    return people[phone] || { name: '?', emoji: '❓' };
  }

  async function addPromise() {
    if (!text.trim() || !deadline) return;
    const { promise } = await addPromiseRow(user.phone, text.trim(), deadline);
    if (promise) setPromises((list) => [...list, promise]);
    setText('');
    setDeadline('');
    setOpen(false);
  }

  async function markFulfilled(id) {
    setPromises((list) => list.map((p) => (p.id === id ? { ...p, status: 'fulfilled' } : p)));
    await updatePromiseRow(id, { status: 'fulfilled' });
  }

  async function voteAgainst(p) {
    if (p.votesAgainst.includes(user.phone)) return;
    const votesAgainst = [...p.votesAgainst, user.phone];
    const status = votesAgainst.length >= 1 ? 'broken' : p.status;
    setPromises((list) => list.map((x) => (x.id === p.id ? { ...x, votesAgainst, status } : x)));
    await updatePromiseRow(p.id, { votesAgainst, status });
  }

  return (
    <>
      <div className="section-title">🤞 Обещания</div>
      {promises.length === 0 && <p className="sub">Пообещай что-нибудь — если не сделаешь в срок, друзья смогут это отметить</p>}
      {promises.map((p) => {
        const overdue = isOverdue(p);
        const author = nameOf(p.authorPhone);
        const mine = p.authorPhone === user.phone;
        return (
          <div className="card" key={p.id} style={{ marginBottom: 8 }}>
            <div className="card-row">
              <span>{author.emoji} {author.name}: {p.text}</span>
              {p.status === 'fulfilled' && <span className="badge">✅ Выполнено</span>}
              {p.status === 'broken' && <span className="badge" style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}>💀 Не выполнено</span>}
            </div>
            <p className="sub" style={{ margin: '4px 0 0' }}>
              до {p.deadline}
              {p.status === 'pending' && overdue && ' — просрочено'}
              {p.status === 'pending' && !overdue && ' — в процессе'}
            </p>

            {p.status === 'pending' && (
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                {mine && <button className="btn small" onClick={() => markFulfilled(p.id)}>✅ Я сделал(а)</button>}
                {!mine && overdue && (
                  <button className="btn ghost small" disabled={p.votesAgainst.includes(user.phone)} onClick={() => voteAgainst(p)}>
                    🚩 Отметить "не сделал"
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

      <button className="btn ghost small" onClick={() => setOpen(true)}>+ Новое обещание</button>

      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <h3>Новое обещание</h3>
            <input
              className="field"
              placeholder="Я обещаю купить чипсы всем..."
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <input className="field" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            <button className="btn" onClick={addPromise}>Пообещать</button>
            <button className="btn ghost" onClick={() => setOpen(false)}>Отмена</button>
          </div>
        </div>
      )}
    </>
  );
}
