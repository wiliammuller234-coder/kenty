import { useEffect, useRef, useState } from 'react';

export default function ReactionGame({ onGameOver, best }) {
  const [phase, setPhase] = useState('idle'); // idle | waiting | go | early | result
  const [reactionMs, setReactionMs] = useState(null);
  const timerRef = useRef(null);
  const goAtRef = useRef(0);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  function start() {
    setPhase('waiting');
    setReactionMs(null);
    const delay = 1200 + Math.random() * 2500;
    timerRef.current = setTimeout(() => {
      goAtRef.current = Date.now();
      setPhase('go');
    }, delay);
  }

  function handleTap() {
    if (phase === 'idle' || phase === 'early' || phase === 'result') {
      start();
      return;
    }
    if (phase === 'waiting') {
      clearTimeout(timerRef.current);
      setPhase('early');
      return;
    }
    if (phase === 'go') {
      const ms = Date.now() - goAtRef.current;
      setReactionMs(ms);
      setPhase('result');
      onGameOver?.(ms);
    }
  }

  const colors = {
    idle: 'var(--surface)',
    waiting: 'var(--danger)',
    go: '#2ee6a6',
    early: 'var(--surface)',
    result: 'var(--surface)',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <div
        onClick={handleTap}
        onTouchStart={(e) => {
          e.preventDefault();
          handleTap();
        }}
        style={{
          width: 260,
          height: 260,
          borderRadius: '50%',
          background: colors[phase],
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          userSelect: 'none',
          touchAction: 'none',
          cursor: 'pointer',
          textAlign: 'center',
          color: phase === 'waiting' || phase === 'go' ? '#fff' : 'inherit',
        }}
      >
        {phase === 'idle' && (
          <>
            <div style={{ fontSize: 40 }}>⚡</div>
            <div>Тапни, чтобы начать</div>
          </>
        )}
        {phase === 'waiting' && <div style={{ fontWeight: 700 }}>Жди зелёный...</div>}
        {phase === 'go' && <div style={{ fontSize: 28, fontWeight: 700 }}>ТАПАЙ!</div>}
        {phase === 'early' && (
          <>
            <div style={{ fontSize: 28 }}>😬 Рано!</div>
            <div className="sub">Тапни, чтобы попробовать снова</div>
          </>
        )}
        {phase === 'result' && (
          <>
            <div style={{ fontSize: 32, fontWeight: 700 }}>{reactionMs} мс</div>
            <div className="sub">{best ? `рекорд: ${best} мс` : ''}</div>
            <div className="sub">Тапни ещё раз</div>
          </>
        )}
      </div>
      <p className="sub">Жди, пока круг станет зелёным, и тапни как можно быстрее</p>
    </div>
  );
}
