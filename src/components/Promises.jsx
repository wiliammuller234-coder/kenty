import { useState } from 'react';
import { loadState, saveState } from '../storage';
import { isOverdue } from '../utils/promises';

export default function Promises({ friends }) {
  const [promises, setPromises] = useState(() => loadState('promises', []));
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [deadline, setDeadline] = useState('');

  function persist(next) {
    setPromises(next);
    saveState('promises', next);
  }

  function addPromise() {
    if (!text.trim() || !deadline) return;
    persist([...promises, { id: crypto.randomUUID(), text: text.trim(), deadline, status: 'pending', votesAgainst: [] }]);
    setText('');
    setDeadline('');
    setOpen(false);
  }

  function markFulfilled(id) {
    persist(promises.map((p) => (p.id === id ? { ...p, status: 'fulfilled' } : p)));
  }

  function voteAgainst(id, friendId) {
    persist(
      promises.map((p) => {
        if (p.id !== id || p.votesAgainst.includes(friendId)) return p;
        const votesAgainst = [...p.votesAgainst, friendId];
        const broken = votesAgainst.length >= 1;
        return { ...p, votesAgainst, status: broken ? 'broken' : p.status };
      })
    );
  }

  return (
    <>
      <div className="section-title">🤞 Обещания</div>
      {promises.length === 0 && <p className="sub">Пообещай что-нибудь — если не сделаешь в срок, друзья смогут это отметить</p>}
      {promises.map((p) => {
        const overdue = isOverdue(p);
        return (
          <div className="card" key={p.id} style={{ marginBottom: 8 }}>
            <div className="card-row">
              <span>{p.text}</span>
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
                <button className="btn small" onClick={() => markFulfilled(p.id)}>✅ Я сделал(а)</button>
                {overdue &&
                  friends.map((f) => (
                    <button
                      key={f.id}
                      className="btn ghost small"
                      disabled={p.votesAgainst.includes(f.id)}
                      onClick={() => voteAgainst(p.id, f.id)}
                    >
                      🚩 {f.name} говорит "не сделал"
                    </button>
                  ))}
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
