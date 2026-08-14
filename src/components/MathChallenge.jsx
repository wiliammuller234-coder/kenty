import { useEffect, useRef, useState } from 'react';
import { DIFFICULTIES, generateProblem, streakBonus } from '../utils/mathChallenge';
import { logMathScore, getMathLeaderboard, getMainChatMembers } from '../lib/db';

const POINTS_PER_CORRECT = 10;
const DIFF_LIST = Object.values(DIFFICULTIES);

function Leaderboard({ user, initialDifficulty }) {
  const [filter, setFilter] = useState(initialDifficulty || null);
  const [data, setData] = useState(null);
  const [names, setNames] = useState(new Map());

  useEffect(() => {
    getMainChatMembers(user.phone).then((members) => {
      const map = new Map(members.map((m) => [m.phone, m.profile]));
      map.set(user.phone, { name: user.name, emoji: user.emoji, avatarImg: user.avatarImg });
      setNames(map);
    });
  }, [user.phone]);

  useEffect(() => {
    getMathLeaderboard(user.phone, filter).then(setData);
  }, [user.phone, filter]);

  return (
    <>
      <div className="buyer-pick">
        <button type="button" className={`buyer-chip ${!filter ? 'sel' : ''}`} onClick={() => setFilter(null)}>
          Все
        </button>
        {DIFF_LIST.map((d) => (
          <button key={d.id} type="button" className={`buyer-chip ${filter === d.id ? 'sel' : ''}`} onClick={() => setFilter(d.id)}>
            {d.emoji} {d.label}
          </button>
        ))}
      </div>

      {data && data.myRank && (
        <div className="queue-card" style={{ marginTop: 14 }}>
          <div className="label">Твоё место в рейтинге</div>
          <div className="next">Ты занял {data.myRank} место из {data.totalPlayers} игроков</div>
        </div>
      )}

      <div className="section-title" style={{ marginTop: 18 }}>🏆 Таблица рекордов</div>
      <div className="card">
        {(!data || data.rows.length === 0) && <p className="sub" style={{ margin: 0 }}>Пока никто не играл</p>}
        {data?.rows.map((r, i) => {
          const person = names.get(r.phone) || { name: r.phone, emoji: '❓' };
          const diff = DIFFICULTIES[r.difficulty];
          return (
            <div className="card-row" key={r.phone} style={{ marginBottom: i < data.rows.length - 1 ? 12 : 0, alignItems: 'flex-start' }}>
              <span>
                {i + 1}. {person.avatarImg ? <img className="avatar-img" src={person.avatarImg} alt="" /> : person.emoji} {person.name}
                <br />
                <span className="sub" style={{ fontSize: 11 }}>
                  {diff?.emoji} {diff?.label} · {r.time_limit} сек · {r.correct_answers} правильных
                </span>
              </span>
              <span className="amount">{r.score}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}

export default function MathChallenge({ user }) {
  const [view, setView] = useState('menu'); // menu | playing | over | leaderboard
  const [difficulty, setDifficulty] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [problem, setProblem] = useState(null);
  const [input, setInput] = useState('');
  const [correct, setCorrect] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [flash, setFlash] = useState(null); // 'right' | 'wrong' | null
  const [bonusMsg, setBonusMsg] = useState('');
  const [myBest, setMyBest] = useState(null);
  const prevSignatureRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (view !== 'playing') return;
    if (secondsLeft <= 0) {
      finishGame();
      return;
    }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, secondsLeft]);

  function startGame(diffId) {
    const diff = DIFFICULTIES[diffId];
    prevSignatureRef.current = null;
    setDifficulty(diffId);
    setCorrect(0);
    setWrong(0);
    setScore(0);
    setStreak(0);
    setFlash(null);
    setBonusMsg('');
    setSecondsLeft(diff.timeLimit);
    setProblem(generateProblem(diffId, null));
    setInput('');
    setView('playing');
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function nextProblem(diffId) {
    const p = generateProblem(diffId, prevSignatureRef.current);
    prevSignatureRef.current = p.signature;
    setProblem(p);
    setInput('');
    inputRef.current?.focus();
  }

  function submitAnswer() {
    if (!problem || input.trim() === '') return;
    const value = Number(input);
    if (value === problem.answer) {
      const bonus = streakBonus(streak + 1);
      setStreak((s) => s + 1);
      setScore((s) => s + POINTS_PER_CORRECT + bonus);
      setCorrect((c) => c + 1);
      setFlash('right');
      if (bonus > 0) setBonusMsg(`🔥 Серия ${streak + 1}! +${bonus} бонус`);
      setTimeout(() => setFlash(null), 250);
      setTimeout(() => setBonusMsg(''), 1200);
      nextProblem(difficulty);
    } else {
      // Show the right answer briefly rather than silently jumping on — "не
      // зависать" means keep it short, not skip showing it at all.
      setStreak(0);
      setWrong((w) => w + 1);
      setFlash('wrong');
      setBonusMsg(`Правильный ответ: ${problem.answer}`);
      setTimeout(() => {
        setFlash(null);
        setBonusMsg('');
        nextProblem(difficulty);
      }, 1100);
    }
  }

  async function finishGame() {
    setView('over');
    await logMathScore(user.phone, { difficulty, timeLimit: DIFFICULTIES[difficulty].timeLimit, correct, wrong, score });
    const board = await getMathLeaderboard(user.phone, difficulty);
    setMyBest(board.myBest);
  }

  if (view === 'leaderboard') {
    return (
      <div className="screen">
        <button className="btn ghost small" onClick={() => setView('menu')}>← Назад</button>
        <Leaderboard user={user} initialDifficulty={difficulty} />
        <div className="screen-spacer" />
      </div>
    );
  }

  if (view === 'menu') {
    return (
      <div className="screen">
        <div className="queue-card">
          <div className="label">Мини-игра</div>
          <div className="next">🧮 Математический вызов</div>
          <div className="label">Реши как можно больше примеров на время</div>
        </div>

        <div className="section-title" style={{ marginTop: 18 }}>Выбери сложность</div>
        {DIFF_LIST.map((d) => (
          <button key={d.id} className="card-row card" style={{ width: '100%', marginBottom: 10, cursor: 'pointer' }} onClick={() => startGame(d.id)}>
            <span>{d.emoji} {d.label}</span>
            <span className="amount">{d.timeLimit} сек</span>
          </button>
        ))}

        <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => setView('leaderboard')}>
          🏆 Таблица рекордов
        </button>
        <div className="screen-spacer" />
      </div>
    );
  }

  if (view === 'over') {
    return (
      <div className="screen">
        <div className="queue-card">
          <div className="label">🏆 Игра окончена!</div>
          <div className="next">{score} очков</div>
        </div>
        <div className="card" style={{ marginTop: 14 }}>
          <div className="card-row">
            <span>✅ Правильных ответов</span>
            <span className="amount">{correct}</span>
          </div>
          <div className="card-row" style={{ marginTop: 10 }}>
            <span>❌ Ошибок</span>
            <span className="amount">{wrong}</span>
          </div>
          <div className="card-row" style={{ marginTop: 10 }}>
            <span>⭐ Лучший результат</span>
            <span className="amount">{myBest ? myBest.score : score}</span>
          </div>
        </div>
        <button className="btn" style={{ marginTop: 18 }} onClick={() => startGame(difficulty)}>
          Играть снова
        </button>
        <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => setView('leaderboard')}>
          🏆 Таблица рекордов
        </button>
        <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => setView('menu')}>
          Назад
        </button>
        <div className="screen-spacer" />
      </div>
    );
  }

  // playing
  const diff = DIFFICULTIES[difficulty];
  return (
    <div className="screen">
      <div className="card-row">
        <button className="btn ghost small" onClick={() => setView('menu')}>Выйти</button>
        <span className="amount" style={{ color: secondsLeft <= 5 ? 'var(--danger)' : undefined }}>⏱ {secondsLeft}</span>
      </div>

      <div className="card-row" style={{ marginTop: 10 }}>
        <span className="sub">{diff.emoji} {diff.label}</span>
        <span className="sub">Очки: {score}</span>
      </div>

      <div
        className="card"
        style={{
          marginTop: 18,
          textAlign: 'center',
          padding: '32px 16px',
          borderColor: flash === 'right' ? '#2ee6a6' : flash === 'wrong' ? 'var(--danger)' : undefined,
          transition: 'border-color 0.15s',
        }}
      >
        <div style={{ fontSize: 32, fontWeight: 700 }}>{problem?.text}</div>
        {bonusMsg && (
          <div className="sub" style={{ color: flash === 'wrong' ? 'var(--danger)' : '#2ee6a6', marginTop: 8 }}>
            {bonusMsg}
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        className="field"
        style={{ marginTop: 18, textAlign: 'center', fontSize: 22 }}
        type="number"
        inputMode="numeric"
        placeholder="?"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submitAnswer()}
      />
      <button className="btn" style={{ marginTop: 12 }} onClick={submitAnswer}>
        Ответить
      </button>

      {streak >= 2 && <p className="sub" style={{ textAlign: 'center', marginTop: 10 }}>🔥 Серия: {streak}</p>}
      <div className="screen-spacer" />
    </div>
  );
}
