import { useEffect, useMemo, useState } from 'react';
import { getMainChatMembers, getGroupPurchases, addPurchaseRow, deletePurchaseRow, subscribeToPurchases } from '../lib/db';
import { getFamily } from '../utils/family';
import FriendProfile from '../components/FriendProfile';

const MEDALS = ['🥇', '🥈', '🥉'];

function formatNow(iso) {
  return new Date(iso || Date.now()).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function Purchases({ user, friends, onCountChange, onRemoveFriend }) {
  const [purchases, setPurchases] = useState([]);
  const [open, setOpen] = useState(false);
  const [item, setItem] = useState('');
  const [amount, setAmount] = useState('');
  const [toast, setToast] = useState(null);
  const [viewProfile, setViewProfile] = useState(null);
  const [modalError, setModalError] = useState('');
  const [groupMembers, setGroupMembers] = useState([]);
  const [splitWith, setSplitWith] = useState([]);

  useEffect(() => {
    onCountChange?.(purchases.filter((p) => p.buyerPhone === user.phone).length);
  }, [purchases, user.phone]);

  useEffect(() => {
    let cancelled = false;
    getMainChatMembers(user.phone).then((members) => {
      if (cancelled) return;
      const mapped = members
        .filter((m) => m.phone !== user.phone)
        .map((m) => ({ id: m.phone, phone: m.phone, name: m.profile.name, emoji: m.profile.emoji, avatarImg: m.profile.avatarImg }));
      setGroupMembers(mapped);
      const phones = [user.phone, ...mapped.map((m) => m.phone)];
      getGroupPurchases(phones).then((rows) => {
        if (!cancelled) setPurchases(rows);
      });
    });
    // New purchases from anyone in the group land here live — the whole point of
    // this table is that everyone sees everyone else's purchases, not just their own.
    const unsubscribe = subscribeToPurchases((p) => {
      setPurchases((list) => (list.some((x) => x.id === p.id) ? list : [...list, p]));
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [user.phone]);

  function notify(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 1600);
  }

  // Everyone in the shared group shows up in the leaderboard from 0 ₽ right away,
  // merged with any locally-added friends who aren't group members. Locally-added
  // friends go in FIRST — they're just a stale local snapshot from whenever they were
  // added — so a live group member's current name/emoji/avatar always wins over it.
  const order = useMemo(() => {
    const byId = new Map();
    byId.set(user.phone, { id: user.phone, name: user.name, emoji: user.emoji, avatarImg: user.avatarImg });
    for (const f of friends) if (f.phone) byId.set(f.phone, { ...f, id: f.phone });
    for (const m of groupMembers) byId.set(m.id, m);
    return [byId.get(user.phone), ...[...byId.values()].filter((p) => p.id !== user.phone)];
  }, [user, friends, groupMembers]);
  const me = order[0];

  // Totals per person — the fair basis for both the leaderboard and who's up next.
  const totals = useMemo(() => {
    const map = new Map(order.map((p) => [p.id, { ...p, total: 0, count: 0 }]));
    for (const p of purchases) {
      const row = map.get(p.buyerPhone);
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

  // Same shape as `totals` but scoped to the current calendar month — resets every
  // month automatically since it's just filtering by date, not a separate stored total.
  const monthTotals = useMemo(() => {
    const now = new Date();
    const map = new Map(order.map((p) => [p.id, { ...p, total: 0, count: 0 }]));
    for (const p of purchases) {
      const d = new Date(p.date);
      if (d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear()) continue;
      const row = map.get(p.buyerPhone);
      if (row) {
        row.total += p.amount;
        row.count += 1;
      }
    }
    return [...map.values()];
  }, [order, purchases]);

  const monthSpent = useMemo(() => monthTotals.reduce((sum, p) => sum + p.total, 0), [monthTotals]);
  const monthTop = useMemo(() => monthTotals.slice().sort((a, b) => b.total - a.total)[0], [monthTotals]);
  // Includes people with 0 ₽ this month — matches "Топ по тратам" below, which does
  // the same. Filtering them out used to make this contradict that list (e.g. showing
  // someone with 54 ₽ as "least spent" while the leaderboard right below shows someone
  // else at 0 ₽), which just read as a bug even though it wasn't one.
  const monthLow = useMemo(() => monthTotals.slice().sort((a, b) => a.total - b.total)[0], [monthTotals]);
  const monthName = new Date().toLocaleString('ru-RU', { month: 'long' });
  const daysLeftInMonth = useMemo(() => {
    const now = new Date();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return lastDay - now.getDate();
  }, []);

  function maxAmountFor(age) {
    if (!age) return 5000;
    if (age < 14) return 1000;
    if (age < 18) return 3000;
    return 15000;
  }

  // Central gate — every path that creates a purchase (new or repeat) goes through
  // this, so the age limit can't be bypassed via the quick-repeat button.
  // A split purchase writes one row per co-buyer (each gets an equal share) — this
  // is the one deliberate exception to "can't log a purchase for someone else": it's
  // an explicit, visible split the person initiating it chose, not a hidden one.
  async function commitPurchase(itemName, amountValue, coBuyerPhones = []) {
    const max = maxAmountFor(user.age);
    if (Number(amountValue) > max) {
      notify(`⚠️ Слишком много — максимум ${max} ₽`);
      return false;
    }
    const buyers = [user.phone, ...coBuyerPhones];
    const share = Math.round(Number(amountValue) / buyers.length);
    const label = coBuyerPhones.length > 0 ? `🤝 ${itemName} (вместе, ${buyers.length} чел.)` : itemName;
    const results = await Promise.all(buyers.map((phone) => addPurchaseRow(phone, label, share)));
    if (results.some((r) => r.error)) {
      notify('Не отправилось — проверь миграцию базы');
      return false;
    }
    setPurchases((list) => [...list, ...results.map((r) => r.purchase)]);
    return true;
  }

  function toggleSplit(phone) {
    setSplitWith((list) => (list.includes(phone) ? list.filter((p) => p !== phone) : [...list, phone]));
  }

  async function addPurchase() {
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
    if (await commitPurchase(item.trim(), amount, splitWith)) {
      notify(splitWith.length ? `Покупка добавлена на ${splitWith.length + 1} чел. ✅` : 'Покупка добавлена ✅');
      setItem('');
      setAmount('');
      setSplitWith([]);
      setOpen(false);
    }
  }

  async function repeatPurchase(p) {
    if (await commitPurchase(p.item, p.amount)) {
      notify(`Ещё раз: ${p.item} +1 ✅`);
    }
  }

  async function removePurchase(p) {
    if (!confirm(`Удалить «${p.item}» из истории?`)) return;
    setPurchases((list) => list.filter((x) => x.id !== p.id));
    await deletePurchaseRow(p.id);
  }

  function nameOf(phone) {
    return order.find((o) => o.id === phone) || { name: '?', emoji: '❓' };
  }

  return (
    <>
      <div className="screen">
        <div className="queue-card">
          {fairNext.id === user.phone ? (
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

        <div className="section-title">Итог за {monthName}</div>
        <div className="card">
          {monthSpent === 0 ? (
            <p className="sub" style={{ margin: 0 }}>В этом месяце ещё никто ничего не покупал</p>
          ) : (
            <>
              <div className="card-row">
                <span>📈 Больше всех потратил(а)</span>
                <span className="amount">{monthTop?.emoji} {monthTop?.name}</span>
              </div>
              <div className="card-row" style={{ marginTop: 10 }}>
                <span>📉 Меньше всех потратил(а)</span>
                <span className="amount">{monthLow?.emoji} {monthLow?.name}</span>
              </div>
              <div className="card-row" style={{ marginTop: 10 }}>
                <span>💸 Всего за месяц</span>
                <span className="amount">{monthSpent} ₽</span>
              </div>
            </>
          )}
          <p className="sub" style={{ margin: '10px 0 0' }}>
            {daysLeftInMonth === 0 ? '⏳ Месяц заканчивается сегодня' : `⏳ До конца месяца: ${daysLeftInMonth} дн.`}
          </p>
        </div>

        {leaderboard.length > 0 && (
          <>
            <div className="section-title" style={{ marginTop: 18 }}>Топ по тратам</div>
            <div className="card">
              {leaderboard.map((l, i) => (
                <div
                  className="card-row"
                  key={l.id}
                  style={{ marginBottom: i < 2 ? 10 : 0, cursor: l.id !== user.phone ? 'pointer' : 'default' }}
                  onClick={() => l.id !== user.phone && setViewProfile(l)}
                >
                  <span>
                    {MEDALS[i]} {l.avatarImg ? <img className="avatar-img" src={l.avatarImg} alt="" /> : l.emoji} {l.name}
                  </span>
                  <span className="amount">{l.total} ₽</span>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="card-row" style={{ marginTop: 18, marginBottom: 8 }}>
          <div className="section-title" style={{ margin: 0 }}>История покупок</div>
        </div>
        {purchases
          .slice()
          .reverse()
          .map((p) => {
            const b = nameOf(p.buyerPhone);
            const mine = p.buyerPhone === user.phone;
            return (
              <div className="purchase-item" key={p.id}>
                <div className="emoji" style={{ cursor: !mine ? 'pointer' : 'default' }} onClick={() => !mine && setViewProfile(b)}>
                  {b.avatarImg ? <img className="avatar-img" src={b.avatarImg} alt="" /> : b.emoji}
                </div>
                <div className="info" style={{ cursor: !mine ? 'pointer' : 'default' }} onClick={() => !mine && setViewProfile(b)}>
                  <div className="title">{p.item}</div>
                  <div className="meta">{b.name} · {formatNow(p.date)}</div>
                </div>
                <div className="amount">{p.amount} ₽</div>
                {mine && (
                  <>
                    <button className="repeat-btn" title="Купил(а) ещё раз то же самое" onClick={() => repeatPurchase(p)}>
                      🔁
                    </button>
                    <button className="repeat-btn" title="Удалить из истории" onClick={() => removePurchase(p)}>
                      🗑
                    </button>
                  </>
                )}
              </div>
            );
          })}
        {purchases.length === 0 && <p className="sub">Пока никто ничего не покупал</p>}
        <div className="screen-spacer" />
      </div>

      <button
        className="fab"
        onClick={() => {
          setModalError('');
          // People marked "семья" split every purchase automatically — no need to
          // re-pick them each time the way a one-off "bought this together" split does.
          getFamily(user.phone).then((familyPhones) => {
            setSplitWith(groupMembers.filter((m) => familyPhones.includes(m.phone)).map((m) => m.phone));
            setOpen(true);
          });
        }}
      >
        +
      </button>

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
            {groupMembers.length > 0 && (
              <>
                <p className="sub" style={{ marginTop: 4 }}>Купили вместе с кем-то? Сумма поделится поровну</p>
                <div className="emoji-pick">
                  {groupMembers.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className={splitWith.includes(m.phone) ? 'sel' : ''}
                      onClick={() => toggleSplit(m.phone)}
                      title={m.name}
                    >
                      {m.emoji}
                    </button>
                  ))}
                </div>
                {splitWith.length > 0 && amount && (
                  <p className="sub">
                    По {Math.round(Number(amount) / (splitWith.length + 1))} ₽ на каждого ({splitWith.length + 1} чел.)
                  </p>
                )}
              </>
            )}
            <button className="btn" onClick={addPurchase}>Добавить</button>
            <button className="btn ghost" onClick={() => { setOpen(false); setSplitWith([]); }}>Отмена</button>
          </div>
        </div>
      )}

      {viewProfile && <FriendProfile friend={viewProfile} myPhone={user.phone} onClose={() => setViewProfile(null)} onRemove={onRemoveFriend} />}
    </>
  );
}
