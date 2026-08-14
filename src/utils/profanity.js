// Root-word match, not exact-word — catches inflected forms (падежи/окончания) the
// way people actually type, without trying to defeat deliberate letter-swap evasion.
const ROOTS = [
  'бляд', 'блят', 'сука', 'сучк', 'сучар',
  'хуй', 'хуе', 'хуё', 'хуя', 'хуи',
  'пизд', 'пезд',
  'ебат', 'ебал', 'ебан', 'ебуч', 'ебл', 'въеб', 'заеб', 'наеб', 'отъеб', 'подъеб', 'приеб', 'разъеб', 'уеб', 'выеб',
  'муда', 'мудак', 'мудил',
  'гандон', 'гондон',
  'долбоеб', 'долбоёб',
  'пидор', 'пидар', 'педик',
];

const PATTERN = new RegExp(ROOTS.join('|'), 'i');

export function containsProfanity(text) {
  if (!text) return false;
  return PATTERN.test(text);
}
