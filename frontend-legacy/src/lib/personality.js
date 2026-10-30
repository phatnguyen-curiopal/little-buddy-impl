// Buddy's personality: one of the 16 four-letter types (same codes as the
// backend's personalities table). Pure, so node --test covers the scoring.
import { DEFAULT_DESIGN } from './designs.js';

// Four families of types, used to group the picker. Each type also has the
// face that best shows its temperament in the preview.
export const GROUPS = ['NT', 'NF', 'SJ', 'SP'];

export const TYPES = [
  { code: 'INTJ', emotion: 'thinking' }, { code: 'INTP', emotion: 'curious' }, { code: 'ENTJ', emotion: 'happy' }, { code: 'ENTP', emotion: 'wink' },
  { code: 'INFJ', emotion: 'neutral' }, { code: 'INFP', emotion: 'shy' }, { code: 'ENFJ', emotion: 'love' }, { code: 'ENFP', emotion: 'excited' },
  { code: 'ISTJ', emotion: 'neutral' }, { code: 'ISFJ', emotion: 'love' }, { code: 'ESTJ', emotion: 'happy' }, { code: 'ESFJ', emotion: 'happy' },
  { code: 'ISTP', emotion: 'curious' }, { code: 'ISFP', emotion: 'shy' }, { code: 'ESTP', emotion: 'laughing' }, { code: 'ESFP', emotion: 'excited' },
].map((type) => ({ ...type, group: groupOf(type.code) }));

export function groupOf(code) {
  const [, sn, tf, jp] = code;
  if (sn === 'N') return tf === 'T' ? 'NT' : 'NF';
  return jp === 'J' ? 'SJ' : 'SP';
}

export const typeOf = (code) => TYPES.find((t) => t.code === code) ?? TYPES.find((t) => t.code === 'ENFP');

// Twelve either/or questions about the Buddy a parent wants, three per axis
// so a majority always decides. Which option means which letter alternates,
// so answering "always the first one" does not produce an extreme type.
// The wording lives in the dictionaries as pq{n}, pq{n}a, pq{n}b.
export const QUESTIONS = [
  { n: 1, axis: 0, a: 'E', b: 'I' },
  { n: 2, axis: 1, a: 'S', b: 'N' },
  { n: 3, axis: 2, a: 'T', b: 'F' },
  { n: 4, axis: 3, a: 'J', b: 'P' },
  { n: 5, axis: 0, a: 'I', b: 'E' },
  { n: 6, axis: 1, a: 'N', b: 'S' },
  { n: 7, axis: 2, a: 'F', b: 'T' },
  { n: 8, axis: 3, a: 'P', b: 'J' },
  { n: 9, axis: 0, a: 'E', b: 'I' },
  { n: 10, axis: 1, a: 'S', b: 'N' },
  { n: 11, axis: 2, a: 'T', b: 'F' },
  { n: 12, axis: 3, a: 'J', b: 'P' },
];

const AXES = [['E', 'I'], ['S', 'N'], ['T', 'F'], ['J', 'P']];

// answers: 'a' or 'b' per question, in order.
export function scoreQuiz(answers) {
  if (!Array.isArray(answers) || answers.length !== QUESTIONS.length || answers.some((x) => x !== 'a' && x !== 'b')) {
    throw new Error('scoreQuiz: every question needs an answer');
  }
  const votes = AXES.map(() => ({}));
  QUESTIONS.forEach((q, i) => {
    const letter = q[answers[i]];
    votes[q.axis][letter] = (votes[q.axis][letter] ?? 0) + 1;
  });
  return AXES.map(([x, y], i) => ((votes[i][x] ?? 0) > (votes[i][y] ?? 0) ? x : y)).join('');
}

// Short, easy to say, easy for a four-year-old to call out.
export const NAME_SUGGESTIONS = ['Buddy', 'Bin', 'Mít', 'Sóc', 'Kem', 'Bắp', 'Na', 'Tôm', 'Nấm', 'Bơ', 'Mochi', 'Bông'];

export function suggestName(current, random = Math.random) {
  const pool = NAME_SUGGESTIONS.filter((n) => n !== current);
  return pool[Math.floor(random() * pool.length)];
}

export const ROLES = ['friend', 'daddy', 'mommy', 'teacher'];
export const DEFAULT_PROFILE = Object.freeze({ name: 'Buddy', design: DEFAULT_DESIGN, role: 'friend', personality: 'ENFP', personality_source: 'default' });
export const NAME_MAX = 24;
