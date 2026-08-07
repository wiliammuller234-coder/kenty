import { useEffect, useMemo, useState } from 'react';
import { loadState, saveState } from '../storage';
import FriendProfile from '../components/FriendProfile';

const SEED = [];

const MEDALS = ['🥇', '🥈', '🥉'];

function formatNow() {
  return new Date().toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function Purchases({ user, friends, onCountChange }) {
  const [purchases, setPurchases] = useState(() => loadState('purchases', SEED));
  const [open, setOpen] = useState(false);
  const [item, setItem] = useState('');
  const [amount, setAmount] = useState('');
  const [toast, setToast] = useState(null);
  const [viewProfile, setViewProfile] = useState(null);
  const [modalError, setModalError] = useState('');

  useEffect(() => {
    onCountChange?.(purchases.length);
  }, [purchases]);

  function notify(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 1600);
  }

  const order = useMemo(() => [{ id: 'me', name: user.name, emoji: user.emoji }, ...friends], [user, friends]);
  const me = order[0];

  // Totals per person — the fair basis for both the leaderboard and who's up next.
  const totals = useMemo(() => {
    const map = new Map(order.map((p) => [p.id, { ...p, total: 0, count: 0 }]));
    for (const p of purchases) {
      const row = map.get(p.buyerId);
      if (row) {
        row.total += p.amount;
        row.count += 1;
      }
    }
    return [...map.values()];
  }, [order, purchases]);

  const leaderboard = useMemo(
    () => totals.slice().sort((a, b) => b.total - a.total).slice(0, 3),
    [totals]
  );

  // Fair next payer: whoever has spent the least so far catches up next.
  const fairNext = useMemo(
    () => totals.slice().sort((a, b) => a.total - b.total)[0],
    [totals]
  );

  function maxAmountFor(age) {
    if (!age) return 5000;
    if (age < 14) return 1000;
    if (age < 18) return 3000;
    return 15000;
  }

  // Central gate — every path that creates a purchase (new or repeat) goes through
  // this, so the age limit can't be bypassed via the quick-repeat button.
  function commitPurchase(itemName, amountValue) {
    const max = maxAmountFor(user.age);
    if (Number(amountValue) > max) {
      notify(`⚠️ Слишком много — максимум ${max} ₽`);
      return false;
    }
    const p = {
      id: crypto.randomUUID(),
      buyerId: me.id,
      item: itemName,
      amount: Number(amountValue),
      date: formatNow(),
    };
    const next = [...purchases, p];
    setPurchases(next);
    saveState('purchases', next);
    return true;
  }

  function addPurchase() {
    if (!item.trim() || !amount) return;
    const max = maxAmountFor(user.age);
    if (Number(amount) > max) {
      setModalError(
        user.age
          ? `Многовато для ${user.age} лет — максимум ${max} ₽ за одну покупку`
          : `Слишком много — максимум ${max} ₽ за покупку (укажи возраст в профиле для точного лимита)`
      );
      return;
    }
    setModalError('');
    if (commitPurchase(item.trim(), amount)) {
      notify('Покупка добавлена ✅');
      setItem('');
      setAmount('');
      setOpen(false);
    }
  }

  function repeatPurchase(p) {
    if (commitPurchase(p.item, p.amount)) {
      notify(`Ещё раз: ${p.item} +1 ✅`);
    }
  }

  function clearHistory() {
    if (!confirm('Стереть всю историю покупок насовсем?')) return;
    setPurchases([]);
    saveState('purchases', []);
  }

  function nameOf(id) {
    return order.find((o) => o.id === id) || { name: '?', emoji: '❓' };
  }

  return (
    <>
      <div className="screen">
        <div className="queue-card">
          {fairNext.id === 'me' ? (
            <>
              <div className="label">Меньше всех потратил(а) — ты</div>
              <div className="next">{me.emoji} Твоя очередь платить</div>
            </>
          ) : (
            <>
              <div className="label">Меньше всех потратил</div>
              <div className="next">{fairNext.emoji} {fairNext.name}</div>
            </>
          )}
          <div className="label">потратил(а) {fairNext.total} ₽ всего</div>
        </div>

        {leaderboard.some((l) => l.total > 0) && (
          <>
            <div className="section-title">Топ по тратам</div>
            <div className="card">
              {leaderboard.map((l, i) => (
                <div
                  className="card-row"
                  key={l.id}
                  style={{ marginBottom: i < 2 ? 10 : 0, cursor: l.id !== 'me' ? 'pointer' : 'default' }}
                  onClick={() => l.id !== 'me' && setViewProfile(l)}
                >
                  <span>{MEDALS[i]} {l.emoji} {l.name}</span>
                  <span className="amount">{l.total} ₽</span>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="card-row" style={{ marginTop: 18, marginBottom: 8 }}>
          <div className="section-title" style={{ margin: 0 }}>История покупок</div>
          {purchases.length > 0 && (
            <button className="repeat-btn" title="Очистить историю" onClick={clearHistory}>🗑</button>
          )}
        </div>
        {purchases
          .slice()
          .reverse()
          .map((p) => {
            const b = nameOf(p.buyerId);
            const mine = p.buyerId === 'me';
            return (
              <div className="purchase-item" key={p.id}>
                <div className="emoji" style={{ cursor: !mine ? 'pointer' : 'default' }} onClick={() => !mine && setViewProfile(b)}>
                  {b.emoji}
                </div>
                <div className="info" style={{ cursor: !mine ? 'pointer' : 'default' }} onClick={() => !mine && setViewProfile(b)}>
                  <div className="title">{p.item}</div>
                  <div className="meta">{b.name} · {p.date}</div>
                </div>
                <div className="amount">{p.amount} ₽</div>
                {mine && (
                  <button className="repeat-btn" title="Купил(а) ещё раз то же самое" onClick={() => repeatPurchase(p)}>
                    🔁
                  </button>
                )}
              </div>
            );
          })}
        {purchases.length === 0 && <p className="sub">Пока никто ничего не покупал</p>}
        <div className="screen-spacer" />
      </div>

      <button className="fab" onClick={() => { setModalError(''); setOpen(true); }}>+</button>

      {toast && <div className="toast">{toast}</div>}

      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <h3>Новая покупка</h3>
            <p className="sub">Платишь ты: {me.emoji} {me.name} — записать покупку за другого нельзя, у каждого своя кнопка на своём телефоне</p>
            {modalError && <p className="sub" style={{ color: 'var(--danger)' }}>{modalError}</p>}
            <input
              className="field"
              placeholder="Что купили (чипсы, пицца...)"
              value={item}
              onChange={(e) => setItem(e.target.value)}
            />
            <input
              className="field"
              type="number"
              placeholder="Сумма, ₽"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <button className="btn" onClick={addPurchase}>Добавить</button>
            <button className="btn ghost" onClick={() => setOpen(false)}>Отмена</button>
          </div>
        </div>
      )}

      {viewProfile && <FriendProfile friend={viewProfile} onClose={() => setViewProfile(null)} />}
    </>
  );
}
