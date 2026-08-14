export const DIFFICULTIES = {
  easy: { id: 'easy', label: 'Лёгкая', emoji: '🟢', timeLimit: 60 },
  medium: { id: 'medium', label: 'Средняя', emoji: '🟡', timeLimit: 40 },
  hard: { id: 'hard', label: 'Сложная', emoji: '🔴', timeLimit: 30 },
};

const RANGES = {
  easy: { addSub: [1, 20], factor: [1, 5] },
  medium: { addSub: [10, 99], factor: [2, 12] },
  hard: { addSub: [100, 999], factor: [12, 40] },
};

function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

const OPS = ['+', '-', '×', '÷'];

// Builds a fully-solved problem first (both operands + result all clean, non-negative,
// division always exact) and only afterwards picks which of the three numbers to hide
// — that ordering is what guarantees the blank always has exactly one valid answer,
// instead of generating three random numbers and hoping they happen to work out.
function buildSolved(difficulty, op) {
  const r = RANGES[difficulty];
  if (op === '+') {
    const a = randInt(...r.addSub);
    const b = randInt(...r.addSub);
    return { a, b, c: a + b };
  }
  if (op === '-') {
    // a >= b always, so the result is never negative.
    const a = randInt(...r.addSub);
    const b = randInt(1, a);
    return { a, b, c: a - b };
  }
  if (op === '×') {
    const a = randInt(...r.factor);
    const b = randInt(...r.factor);
    return { a, b, c: a * b };
  }
  // ÷: build from a clean multiplication so the division is always exact.
  const divisor = randInt(...r.factor);
  const quotient = randInt(...r.factor);
  return { a: divisor * quotient, b: divisor, c: quotient };
}

function signatureOf(op, a, b, c) {
  return `${op}:${a}:${b}:${c}`;
}

// previousSignature avoids the exact same problem appearing twice in a row — a small
// retry loop rather than tracking a whole history, since the range is large enough
// that a second collision is effectively never going to happen.
export function generateProblem(difficulty, previousSignature) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const op = OPS[Math.floor(Math.random() * OPS.length)];
    const { a, b, c } = buildSolved(difficulty, op);
    const signature = signatureOf(op, a, b, c);
    if (signature === previousSignature) continue;

    const blank = ['a', 'b', 'c'][Math.floor(Math.random() * 3)];
    let text;
    let answer;
    if (blank === 'a') {
      text = `□ ${op} ${b} = ${c}`;
      answer = a;
    } else if (blank === 'b') {
      text = `${a} ${op} □ = ${c}`;
      answer = b;
    } else {
      text = `${a} ${op} ${b} = □`;
      answer = c;
    }
    return { text, answer, signature };
  }
  // Effectively unreachable given the ranges, but keep a safe fallback.
  const { a, b, c } = buildSolved(difficulty, '+');
  return { text: `${a} + ${b} = □`, answer: c, signature: signatureOf('+', a, b, c) };
}

export function streakBonus(streak) {
  if (streak === 10) return 30;
  if (streak === 5) return 15;
  if (streak === 3) return 5;
  return 0;
}
