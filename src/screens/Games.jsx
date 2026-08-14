import { useEffect, useMemo, useState } from 'react';
import { getMainChatMembers, getGameScores, recordGameScore } from '../lib/db';
import PlaneGame from '../components/PlaneGame';
import TapCounter from '../components/TapCounter';
import ReactionGame from '../components/ReactionGame';
import MathChallenge from '../components/MathChallenge';

const MEDALS = ['🥇', '🥈', '🥉'];

function useNamedMembers(user) {
  const [groupMembers, setGroupMembers] = useState([]);
  useEffect(() => {
    let cancelled = false;
    getMainChatMembers(user.phone).then((members) => {
      if (!cancelled) {
        setGroupMembers(members.map((m) => ({ phone: m.phone, name: m.profile.name, emoji: m.profile.emoji, avatarImg: m.profile.avatarImg })));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [user.phone]);
  return useMemo(() => {
    const map = new Map(groupMembers.map((m) => [m.phone, m]));
    map.set(user.phone, { phone: user.phone, name: user.name, emoji: user.emoji, avatarImg: user.avatarImg });
    return map;
  }, [groupMembers, user]);
}

function Leaderboard({ title, rows }) {
  if (rows.length === 0) return null;
  return (
    <>
      <div className="section-title" style={{ marginTop: 22 }}>{title}</div>
      <div className="card">
        {rows.map((p, i) => (
          <div className="card-row" key={p.phone} style={{ marginBottom: i < rows.length - 1 ? 10 : 0 }}>
            <span>
              {MEDALS[i] || `${i + 1}.`} {p.avatarImg ? <img className="avatar-img" src={p.avatarImg} alt="" /> : p.emoji} {p.name}
            </span>
            <span className="amount">{p.valueLabel}</span>
          </div>
        ))}
      </div>
    </>
  );
}

// Every high-score game (plane, tap counter, reaction) shares this shell: play, save
// a new personal best to the shared table if it beats the old one, show the group's
// top 5, and a running "this session" tally of every score played so far — the plane
// game only ever showed the in-canvas number during a single run, with nothing
// carried over between attempts the way the old Rock-Paper-Scissors tab had.
function ScoreGameScreen({ user, byPhone, gameId, title, unit, higherIsBetter = true, GameComponent }) {
  const [best, setBest] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [session, setSession] = useState({ plays: 0, best: null, last: null });

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function refresh() {
    getGameScores(gameId).then((rows) => {
      setLeaderboard(rows);
      const mine = rows.find((r) => r.phone === user.phone);
      if (mine) setBest(mine.bestScore);
    });
  }

  async function handleGameOver(score) {
    setBest((b) => (b == null || (higherIsBetter ? score > b : score < b) ? score : b));
    setSession((s) => ({
      plays: s.plays + 1,
      last: score,
      best: s.best == null || (higherIsBetter ? score > s.best : score < s.best) ? score : s.best,
    }));
    await recordGameScore(gameId, user.phone, score, { higherIsBetter });
    refresh();
  }

  const rows = useMemo(
    () =>
      leaderboard
        .map((s) => ({ ...s, ...(byPhone.get(s.phone) || { name: s.phone, emoji: '❓' }), valueLabel: `${s.bestScore}${unit}` }))
        .sort((a, b) => (higherIsBetter ? b.bestScore - a.bestScore : a.bestScore - b.bestScore))
        .slice(0, 5),
    [leaderboard, byPhone, unit, higherIsBetter]
  );

  return (
    <>
      <GameComponent onGameOver={handleGameOver} best={best} />

      {session.plays > 0 && (
        <>
          <div className="section-title" style={{ marginTop: 18 }}>Твой счёт (эта сессия)</div>
          <div className="card">
            <div className="card-row">
              <span>🎮 Попыток</span>
              <span className="amount">{session.plays}</span>
            </div>
            <div className="card-row" style={{ marginTop: 10 }}>
              <span>⭐ Лучший результат</span>
              <span className="amount">{session.best}{unit}</span>
            </div>
            <div className="card-row" style={{ marginTop: 10 }}>
              <span>🔁 Последний</span>
              <span className="amount">{session.last}{unit}</span>
            </div>
          </div>
        </>
      )}

      <Leaderboard title={title} rows={rows} />
    </>
  );
}

const GAMES = [
  { id: 'plane', icon: '✈️', label: 'Самолётик' },
  { id: 'tap', icon: '👆', label: 'Тапалка' },
  { id: 'reaction', icon: '⚡', label: 'Реакция' },
  { id: 'math', icon: '🧮', label: 'Мат. вызов' },
];

export default function Games({ user }) {
  const [game, setGame] = useState('plane');
  const byPhone = useNamedMembers(user);

  return (
    <div className="screen">
      <div className="buyer-pick">
        {GAMES.map((g) => (
          <button key={g.id} type="button" className={`buyer-chip ${game === g.id ? 'sel' : ''}`} onClick={() => setGame(g.id)}>
            {g.icon} {g.label}
          </button>
        ))}
      </div>

      {game === 'plane' && (
        <ScoreGameScreen
          user={user}
          byPhone={byPhone}
          gameId="plane"
          title="🏆 Таблица лидеров — Самолётик"
          unit=" 🚧"
          GameComponent={PlaneGame}
        />
      )}
      {game === 'tap' && (
        <ScoreGameScreen
          user={user}
          byPhone={byPhone}
          gameId="tap"
          title="🏆 Таблица лидеров — Тапалка"
          unit=" тапов"
          GameComponent={TapCounter}
        />
      )}
      {game === 'reaction' && (
        <ScoreGameScreen
          user={user}
          byPhone={byPhone}
          gameId="reaction"
          title="🏆 Таблица лидеров — Реакция"
          unit=" мс"
          higherIsBetter={false}
          GameComponent={ReactionGame}
        />
      )}
      {game === 'math' && <MathChallenge user={user} />}

      <div className="screen-spacer" />
    </div>
  );
}
