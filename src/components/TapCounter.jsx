import { useEffect, useRef, useState } from 'react';

const DURATION = 5000;

export default function TapCounter({ onGameOver, best }) {
  const [phase, setPhase] = useState('ready'); // ready | playing | over
  const [taps, setTaps] = useState(0);
  const [msLeft, setMsLeft] = useState(DURATION);
  const endAtRef = useRef(0);
  const rafRef = useRef(null);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  function start() {
    setPhase('playing');
    setTaps(0);
    setMsLeft(DURATION);
    endAtRef.current = Date.now() + DURATION;
    tick();
  }

  function tick() {
    const left = endAtRef.current - Date.now();
    if (left <= 0) {
      setMsLeft(0);
      setPhase('over');
      return;
    }
    setMsLeft(left);
    rafRef.current = requestAnimationFrame(tick);
  }

  function tap() {
    if (phase === 'ready') {
      start();
      return;
    }
    if (phase === 'over') {
      onGameOver?.(taps);
      start();
      return;
    }
    setTaps((t) => t + 1);
  }

  useEffect(() => {
    if (phase === 'over') onGameOver?.(taps);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <div
        onClick={tap}
        onTouchStart={(e) => {
          e.preventDefault();
          tap();
        }}
        style={{
          width: 260,
          height: 260,
          borderRadius: '50%',
          background: phase === 'playing' ? 'var(--accent)' : 'var(--surface)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          userSelect: 'none',
          touchAction: 'none',
          cursor: 'pointer',
        }}
      >
        {phase === 'ready' && (
          <>
            <div style={{ fontSize: 40 }}>👆</div>
            <div>Тапни, чтобы начать</div>
          </>
        )}
        {phase === 'playing' && (
          <>
            <div style={{ fontSize: 56, fontWeight: 700, color: '#fff' }}>{taps}</div>
            <div style={{ color: '#fff' }}>{(msLeft / 1000).toFixed(1)} сек</div>
          </>
        )}
        {phase === 'over' && (
          <>
            <div style={{ fontSize: 32, fontWeight: 700 }}>{taps} тапов</div>
            <div className="sub">{best ? `рекорд: ${best}` : ''}</div>
            <div className="sub">Тапни ещё раз</div>
          </>
        )}
      </div>
      <p className="sub">Тапай как можно быстрее за 5 секунд</p>
    </div>
  );
}
