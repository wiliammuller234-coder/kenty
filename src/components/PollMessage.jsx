export default function PollMessage({ message, userPhone, onVote }) {
  const { poll } = message;
  const totalVotes = poll.options.reduce((sum, o) => sum + (o.votes?.length || 0), 0);
  const myVotes = new Set(poll.options.filter((o) => o.votes?.includes(userPhone)).map((o) => o.text));
  const closed = poll.expiresAt && new Date(poll.expiresAt) <= new Date();

  return (
    <div className="poll">
      <div className="poll-question">📊 {poll.question}</div>
      {poll.options.map((o, i) => {
        const count = o.votes?.length || 0;
        const pct = totalVotes ? Math.round((count / totalVotes) * 100) : 0;
        const mine = myVotes.has(o.text);
        return (
          <button
            key={i}
            className={`poll-option ${mine ? 'voted' : ''}`}
            disabled={closed}
            onClick={() => !closed && onVote(message, i)}
          >
            <div className="poll-option-fill" style={{ width: `${pct}%` }} />
            <span className="poll-option-label">{mine ? '✓ ' : ''}{o.text}</span>
            <span className="poll-option-pct">{count} · {pct}%</span>
          </button>
        );
      })}
      <div className="poll-meta">
        {totalVotes} {plural(totalVotes)} · {poll.multi ? 'можно выбрать несколько' : 'один вариант'}
        {closed ? ' · 🔒 голосование завершено' : poll.expiresAt ? ` · до ${formatUntil(poll.expiresAt)}` : ''}
      </div>
    </div>
  );
}

function formatUntil(iso) {
  return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function plural(n) {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return 'голосов';
  if (last === 1) return 'голос';
  if (last >= 2 && last <= 4) return 'голоса';
  return 'голосов';
}
