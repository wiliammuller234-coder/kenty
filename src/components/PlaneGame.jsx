import { useEffect, useRef, useState } from 'react';

const WIDTH = 320;
const HEIGHT = 400;
const GRAVITY = 0.28;
const FLAP = -5.6;
const PLANE_X = 60;
const PLANE_R = 14;
// Collision uses a smaller radius than the drawn plane — the emoji glyph doesn't
// visually fill its own bounding box, so hitting exactly at PLANE_R felt like dying
// to invisible edges. First few pipes were also brutally tight (130px gap closing
// fast at 95-frame spacing) — first-pass tuning made it nearly unplayable.
const COLLISION_R = 9;
const GAP = 160;
const PIPE_WIDTH = 46;
const PIPE_SPEED = 2;
const SPAWN_EVERY = 120; // frames

function freshState() {
  return {
    planeY: HEIGHT / 2,
    velocity: 0,
    pipes: [],
    frame: 0,
    score: 0,
    playing: false, // becomes true on the first flap
    over: false,
  };
}

// Canvas-based, not DOM-per-frame — a real-time obstacle dodger needs to move ~60
// times a second, which would thrash React's reconciler if pipes/plane were elements.
// The animation loop is a single effect that runs once on mount and keeps going for
// the component's whole lifetime — it used to be recreated every time the `phase`
// React state changed (ready/playing/over), via a [phase] dependency, which meant
// restarting after a crash raced a state update against an effect teardown/rebuild
// and would sometimes just silently not restart. All game state (including whether
// it's currently playing) now lives in stateRef, read fresh every frame; `phase`
// exists purely to pick which overlay to render, not to gate the loop itself.
export default function PlaneGame({ onGameOver, best }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const stateRef = useRef(freshState());
  const [score, setScore] = useState(0);
  const [phase, setPhase] = useState('ready'); // ready | playing | over
  // ScoreGameScreen re-creates handleGameOver on every render (leaderboard refresh,
  // etc.) — reading it through a ref instead of a prop dependency keeps the
  // animation effect below mounted exactly once for the component's whole lifetime.
  const onGameOverRef = useRef(onGameOver);
  onGameOverRef.current = onGameOver;

  function flap() {
    const s = stateRef.current;
    if (!s.playing) {
      if (s.over) {
        stateRef.current = freshState();
        setScore(0);
      }
      stateRef.current.playing = true;
      setPhase('playing');
      return;
    }
    s.velocity = FLAP;
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#6c5ce7';

    function endGame(s, finalScore) {
      s.over = true;
      s.playing = false;
      setPhase('over');
      onGameOverRef.current?.(finalScore);
    }

    function draw() {
      const s = stateRef.current;
      ctx.clearRect(0, 0, WIDTH, HEIGHT);

      // sky
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      if (s.playing) {
        s.velocity += GRAVITY;
        s.planeY += s.velocity;
        s.frame += 1;

        if (s.frame % SPAWN_EVERY === 0) {
          const gapY = 60 + Math.random() * (HEIGHT - 120 - GAP);
          s.pipes.push({ x: WIDTH, gapY, passed: false });
        }
        s.pipes.forEach((p) => (p.x -= PIPE_SPEED));
        s.pipes = s.pipes.filter((p) => p.x > -PIPE_WIDTH);

        // scoring + collision
        for (const p of s.pipes) {
          if (!p.passed && p.x + PIPE_WIDTH < PLANE_X - COLLISION_R) {
            p.passed = true;
            s.score += 1;
            setScore(s.score);
          }
          const withinX = PLANE_X + COLLISION_R > p.x && PLANE_X - COLLISION_R < p.x + PIPE_WIDTH;
          const hitsGap = s.planeY - COLLISION_R < p.gapY || s.planeY + COLLISION_R > p.gapY + GAP;
          if (withinX && hitsGap) {
            endGame(s, s.score);
            break;
          }
        }
        if (s.playing && (s.planeY - COLLISION_R < 0 || s.planeY + COLLISION_R > HEIGHT)) {
          endGame(s, s.score);
        }
      }

      // pipes
      ctx.fillStyle = accent;
      s.pipes.forEach((p) => {
        ctx.fillRect(p.x, 0, PIPE_WIDTH, p.gapY);
        ctx.fillRect(p.x, p.gapY + GAP, PIPE_WIDTH, HEIGHT - (p.gapY + GAP));
      });

      // plane
      ctx.save();
      ctx.translate(PLANE_X, s.planeY);
      ctx.font = `${PLANE_R * 2}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('✈️', 0, 0);
      ctx.restore();

      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <div style={{ position: 'relative' }} onClick={flap} onTouchStart={(e) => { e.preventDefault(); flap(); }}>
        <canvas
          ref={canvasRef}
          width={WIDTH}
          height={HEIGHT}
          style={{ borderRadius: 16, background: 'var(--surface)', touchAction: 'none' }}
        />
        <div style={{ position: 'absolute', top: 10, left: 0, right: 0, textAlign: 'center', fontSize: 28, fontWeight: 700, color: 'var(--text)' }}>
          {score}
        </div>
        {phase === 'ready' && (
          <div className="plane-overlay">
            <div>✈️</div>
            <div>Тапни, чтобы взлететь</div>
          </div>
        )}
        {phase === 'over' && (
          <div className="plane-overlay">
            <div>💥 Врезался</div>
            <div>Счёт: {score}{best ? ` · рекорд: ${best}` : ''}</div>
            <div className="sub">Тапни, чтобы сыграть снова</div>
          </div>
        )}
      </div>
      <p className="sub">Тапай по экрану, чтобы лететь вверх — не влетай в препятствия</p>
    </div>
  );
}
