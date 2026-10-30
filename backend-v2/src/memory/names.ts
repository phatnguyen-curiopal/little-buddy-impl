// Names in context. A Vietnamese nickname is often an ordinary word (Mít is
// jackfruit, Mực is squid, Mai is tomorrow) and speech has no capital letters,
// so a name is never found by its spelling alone. A mention is read from what
// surrounds it: tone marks (Sam is not sấm, bà is not ba), the word in front
// ("bạn Mít" is a person, "ăn mít" is fruit, "con chó Mực" is a pet), the kind
// of thing the card is, how the child usually says it, and the capital letter
// the recogniser gives a name in the middle of a sentence. What that cannot
// settle is asked of the classifier on the same turn.

// Accent-free lower case: for repairing a misheard name and for aliases.
export function nameKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Case, spacing and punctuation aside, with every tone mark kept.
export function exactForm(text: string): string {
  return text.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const cur = [i];
    for (let j = 1; j <= b.length; j += 1) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

function trigrams(word: string): Set<string> {
  const padded = `  ${word} `;
  const out = new Set<string>();
  for (let i = 0; i + 3 <= padded.length; i += 1) out.add(padded.slice(i, i + 3));
  return out;
}

// pg_trgm's similarity(): shared trigrams over all distinct trigrams.
export function trigramSimilarity(a: string, b: string): number {
  const x = trigrams(a);
  const y = trigrams(b);
  let shared = 0;
  for (const t of x) if (y.has(t)) shared += 1;
  return shared / (x.size + y.size - shared || 1);
}

export interface NamedPerson {
  id: string;
  display_name: string;
  name_key: string;
  aliases: string[];
}

export interface PersonCard extends NamedPerson {
  kind: string;
  relation: string | null;
  // How the child says it, in exact form: "bạn mít", "con chó mực".
  cues: string[];
  // The ordinary meaning when the name is also a word: "jackfruit" for Mít.
  also_word: string | null;
}

type Group = 'people' | 'pet' | 'toy' | 'place';

function groupOf(kind: string): Group {
  return kind === 'pet' || kind === 'toy' || kind === 'place' ? kind : 'people';
}

// The same kind of thing: a pet is never a person, a toy never a place. An
// imaginary friend can be either a person or an animal.
export function kindsMatch(a: string, b: string): boolean {
  if (groupOf(a) === groupOf(b)) return true;
  return (a === 'pretend' && groupOf(b) === 'pet') || (b === 'pretend' && groupOf(a) === 'pet');
}

// Words for people that go in front of a name, or stand for one.
const TITLES = new Set([
  'bạn', 'anh', 'chị', 'em', 'cô', 'chú', 'bác', 'dì', 'cậu', 'mợ', 'thím', 'dượng', 'ông', 'bà', 'bố', 'mẹ', 'ba', 'má',
  'bé', 'thầy', 'cu', 'nhỏ',
  'friend', 'uncle', 'aunt', 'auntie', 'grandma', 'grandpa', 'granny', 'nana', 'teacher', 'mr', 'mrs', 'ms', 'miss',
  'cousin', 'brother', 'sister', 'mom', 'mum', 'dad',
]);
// Words that finish a title: "cô giáo Lan", "bạn thân Mít", "bà ngoại".
const TITLE_TAILS = new Set(['giáo', 'thân', 'họ', 'ruột', 'nội', 'ngoại']);
// "bạn Sam" and "Sam" are the same child: these say how the child talks
// about someone, not who it is (unlike cô Lan and chị Lan).
const PLAIN_TITLES = new Set(['bạn', 'bé', 'friend', 'my']);
const ANIMALS = new Set([
  'chó', 'mèo', 'cá', 'chim', 'thỏ', 'rùa', 'gà', 'vịt', 'heo', 'lợn', 'chuột', 'ngựa', 'cún',
  'dog', 'cat', 'puppy', 'kitten', 'kitty', 'fish', 'bunny', 'rabbit', 'hamster', 'bird', 'turtle', 'pony',
]);
// "búp bê Na": the word right before the name is "bê".
const TOYS = new Set(['gấu', 'bê', 'teddy', 'doll', 'robot']);
// Measure words, colours and articles come before ordinary nouns, not names.
const THINGS = new Set([
  'cây', 'quả', 'trái', 'múi', 'hạt', 'cái', 'chiếc', 'cuốn', 'quyển', 'bông', 'ly', 'cốc', 'đĩa', 'bát', 'chén', 'miếng',
  'gói', 'hộp', 'chai', 'lon', 'que', 'củ', 'lá', 'nải', 'màu', 'tô', 'nồi',
  'a', 'an', 'the', 'some',
]);
const FOOD_VERBS = new Set([
  'ăn', 'uống', 'nấu', 'hái', 'trồng', 'mua', 'bán', 'nướng', 'luộc', 'chiên', 'xào', 'gọt', 'bóc', 'ép', 'xay',
  'eat', 'ate', 'eating', 'drink', 'drank', 'cook', 'cooked', 'pick', 'picked', 'buy', 'bought',
]);
const PLACES = new Set([
  'trường', 'lớp', 'quê', 'phố', 'tỉnh', 'làng', 'xóm', 'chợ', 'đi', 'về', 'ở', 'tại',
  'school', 'class', 'city', 'town', 'park', 'visit', 'visited',
]);

// Common words that are also children's names or nicknames, with their
// ordinary meaning. The learner records the meaning of each new name; this
// covers cards made without it (by a parent, or before it was recorded).
const COMMON_WORDS = new Map<string, string>(Object.entries({
  'mít': 'jackfruit', 'bơ': 'avocado or butter', 'na': 'custard apple', 'bắp': 'corn', 'ngô': 'corn', 'tôm': 'shrimp',
  'cua': 'crab', 'mực': 'squid', 'ốc': 'snail', 'sam': 'horseshoe crab', 'gạo': 'rice', 'sữa': 'milk', 'kem': 'ice cream',
  'su': 'chayote', 'bông': 'cotton or flower', 'vàng': 'yellow or gold', 'mai': 'tomorrow or apricot blossom',
  'lan': 'orchid', 'hoa': 'flower', 'hồng': 'pink or rose', 'cúc': 'daisy', 'sen': 'lotus', 'ngọc': 'jade', 'nam': 'south',
  'hải': 'sea', 'sơn': 'paint or mountain', 'mây': 'cloud', 'gió': 'wind', 'nắng': 'sunshine', 'mưa': 'rain', 'sao': 'star',
  'trăng': 'moon', 'xuân': 'spring', 'thu': 'autumn', 'đông': 'winter', 'bi': 'marble', 'cún': 'puppy', 'mèo': 'cat',
  'thỏ': 'rabbit', 'gấu': 'bear', 'heo': 'pig', 'sóc': 'squirrel', 'sẻ': 'sparrow', 'bò': 'cow', 'cốm': 'green rice flakes',
  'xoài': 'mango', 'cam': 'orange', 'chanh': 'lemon', 'táo': 'apple', 'nho': 'grape', 'dâu': 'strawberry', 'đậu': 'bean',
  'mận': 'plum', 'lê': 'pear', 'đào': 'peach', 'quýt': 'tangerine', 'ổi': 'guava', 'khoai': 'potato', 'nấm': 'mushroom',
  'bột': 'flour', 'kẹo': 'candy', 'bánh': 'cake', 'xu': 'coin', 'sâm': 'ginseng', 'mướp': 'loofah', 'tí': 'tiny',
  'ba': 'three', 'má': 'cheek',
  'lily': 'lily (flower)', 'rose': 'rose', 'daisy': 'daisy', 'ruby': 'ruby', 'jade': 'jade', 'pepper': 'pepper',
  'cookie': 'cookie', 'honey': 'honey', 'sky': 'sky', 'river': 'river', 'summer': 'summer', 'sunny': 'sunny',
  'bean': 'bean', 'pickle': 'pickle', 'mango': 'mango', 'peach': 'peach', 'bear': 'bear', 'bunny': 'bunny',
  'tiger': 'tiger', 'ginger': 'ginger', 'olive': 'olive', 'violet': 'violet', 'iris': 'iris', 'amber': 'amber',
  'may': 'may', 'will': 'will', 'hope': 'hope', 'joy': 'joy', 'grace': 'grace', 'star': 'star', 'angel': 'angel',
  'cocoa': 'cocoa',
}));

export function alsoWord(card: { display_name: string; also_word?: string | null }): string | null {
  return card.also_word ?? COMMON_WORDS.get(exactForm(card.display_name)) ?? null;
}

// "bà nội", "Mẹ": a name made only of family words or titles.
function titleOnly(form: string): boolean {
  return form.split(' ').every((w) => TITLES.has(w) || TITLE_TAILS.has(w));
}

function splitTitle(form: string): { title: string; core: string | null } {
  const words = form.split(' ').filter(Boolean);
  let i = 0;
  while (i < words.length && (TITLES.has(words[i]) || TITLE_TAILS.has(words[i]) || PLAIN_TITLES.has(words[i]))) i += 1;
  if (i === words.length) return { title: form, core: null };
  return { title: words.slice(0, i).filter((w) => !PLAIN_TITLES.has(w)).join(' '), core: words.slice(i).join(' ') };
}

// A learned name without "bạn" or "bé" in front: "bạn Sam" is stored as Sam.
export function bareName(name: string): string {
  const words = name.trim().split(/\s+/);
  let i = 0;
  while (i < words.length - 1 && PLAIN_TITLES.has(words[i].toLowerCase())) i += 1;
  return words.slice(i).join(' ');
}

// The card the learner means by a name, or null for someone new. An exact
// name (tone marks count) or an alias first; then a misheard name one edit
// away, or close by trigrams when longer. Family words and titles are never
// fuzzy: they are short and differ by one letter or tone (bà, ba, bố; cô Lan
// and chị Lan are different people). With a kind, only that kind of card.
export function matchName<T extends NamedPerson & { kind?: string }>(people: T[], heard: string, kind?: string): T | null {
  const form = exactForm(heard);
  const key = nameKey(heard);
  if (!form) return null;
  const fits = (p: T) => !kind || !p.kind || kindsMatch(p.kind, kind);
  for (const p of people) if (fits(p) && (exactForm(p.display_name) === form || p.aliases.includes(key))) return p;
  const heardName = splitTitle(form);
  if (heardName.core === null) return null;
  const b = nameKey(heardName.core);
  let best: { person: T; edits: number; score: number } | null = null;
  for (const p of people) {
    if (!fits(p)) continue;
    const own = splitTitle(exactForm(p.display_name));
    if (own.core === null || own.title !== heardName.title) continue;
    const a = nameKey(own.core);
    const shorter = Math.min(a.length, b.length);
    if (shorter < 3) continue;
    const edits = levenshtein(a, b);
    const score = trigramSimilarity(a, b);
    if (!(edits <= 1 || (shorter >= 4 && score >= 0.3))) continue;
    if (!best || edits < best.edits || (edits === best.edits && score > best.score)) best = { person: p, edits, score };
  }
  return best?.person ?? null;
}

interface Token {
  form: string;
  loose: string;
  capital: boolean;
  sentenceStart: boolean;
}

function tokenize(text: string): Token[] {
  const s = text.normalize('NFC');
  const out: Token[] = [];
  let end = 0;
  for (const m of s.matchAll(/[\p{L}\p{N}]+/gu)) {
    const word = m[0];
    const start = m.index ?? 0;
    const gap = s.slice(end, start);
    end = start + word.length;
    out.push({ form: word.toLowerCase(), loose: nameKey(word), capital: word[0] !== word[0].toLowerCase(), sentenceStart: !out.length || /[.!?…]/.test(gap) });
  }
  return out;
}

type Frame = 'person' | 'animal' | 'con' | 'toy' | 'thing' | 'place' | 'none';

function frameBefore(tokens: Token[], i: number): Frame {
  const p1 = tokens[i - 1]?.form;
  const p2 = tokens[i - 2]?.form;
  if (!p1) return 'none';
  if (TITLES.has(p1) || (TITLE_TAILS.has(p1) && p2 !== undefined && TITLES.has(p2))) return 'person';
  if (ANIMALS.has(p1)) return 'animal';
  if (p1 === 'con') return 'con';
  if (TOYS.has(p1)) return 'toy';
  if (THINGS.has(p1) || FOOD_VERBS.has(p1)) return 'thing';
  if (PLACES.has(p1)) return 'place';
  return 'none';
}

type Verdict = 'yes' | 'ask' | 'no';

// One appearance of a card's name: is it that card, maybe, or not?
function verdictAt(tokens: Token[], start: number, len: number, card: PersonCard): Verdict {
  const own = exactForm(card.display_name);
  const next = tokens[start + len];
  // A family word followed by a name is that person's title: "bà Tư" is not grandma.
  if (titleOnly(own) && next?.capital && !next.sentenceStart) return 'no';
  const first = tokens[start];
  // A capital in the middle of a sentence is the recogniser saying "name";
  // without one, a name that is also a word may be just the word.
  const plain: Verdict = alsoWord(card) && !(first.capital && !first.sentenceStart) ? 'ask' : 'yes';
  const group = groupOf(card.kind);
  const animalLike = group === 'pet' || card.kind === 'pretend';
  switch (frameBefore(tokens, start)) {
    case 'thing':
      return 'no';
    case 'person':
      // Children call their pets "bạn" too.
      return group === 'people' ? 'yes' : group === 'pet' ? 'ask' : 'no';
    case 'animal':
      return animalLike ? plain : 'no';
    case 'con':
      return animalLike ? plain : group === 'people' ? 'ask' : 'no';
    case 'toy':
      return group === 'toy' ? plain : 'no';
    case 'place':
      return group === 'place' ? plain : 'no';
    default:
      return plain;
  }
}

function spansAt(tokens: Token[], words: string[], loose: boolean): number[] {
  const out: number[] = [];
  for (let i = 0; i + words.length <= tokens.length; i += 1) {
    if (words.every((w, j) => (loose ? tokens[i + j].loose : tokens[i + j].form) === w)) out.push(i);
  }
  return out;
}

export interface Mentions<T> {
  // Clearly the named one.
  sure: T[];
  // Could be the named one, the ordinary word, or someone with the same name.
  unsure: T[];
  // The name came up only as the ordinary word ("ăn mít").
  words: T[];
}

interface Hit<T> {
  card: T;
  start: number;
  len: number;
  verdict: Verdict;
  cue: boolean;
}

const RANK: Record<Verdict, number> = { no: 0, ask: 1, yes: 2 };

// The cards a transcript mentions, in the order given.
export function findMentions<T extends PersonCard>(cards: T[], text: string): Mentions<T> {
  const tokens = tokenize(text);
  const hits: Hit<T>[] = [];
  for (const card of cards) {
    const cues = card.cues.map((c) => exactForm(c).split(' ')).filter((c) => c[0]);
    const found = (words: string[], loose: boolean) => {
      for (const start of spansAt(tokens, words, loose)) {
        const end = start + words.length;
        // The way the child usually says it settles it: "bạn Mít", "con chó Mực".
        const cue = cues.some((c) => c.length > words.length && end - c.length >= 0 && c.every((w, j) => tokens[end - c.length + j].form === w));
        hits.push({ card, start, len: words.length, verdict: cue ? 'yes' : verdictAt(tokens, start, words.length, card), cue });
      }
    };
    const own = exactForm(card.display_name);
    if (own) found(own.split(' '), false);
    for (const alias of card.aliases) {
      const words = nameKey(exactForm(alias)).split(' ').filter(Boolean);
      if (words.length) found(words, true);
    }
  }

  // A longer name wins its words: "Bảo Anh" is not also "Bảo". Cards sharing
  // the same words are read together.
  hits.sort((a, b) => b.len - a.len);
  const taken = new Set<number>();
  const groups = new Map<string, Hit<T>[]>();
  for (const h of hits) {
    const at = `${h.start}:${h.len}`;
    if (!groups.has(at)) {
      const span = Array.from({ length: h.len }, (_, k) => h.start + k);
      if (span.some((k) => taken.has(k))) continue;
      span.forEach((k) => taken.add(k));
      groups.set(at, []);
    }
    groups.get(at)!.push(h);
  }

  const best = new Map<T, Verdict>();
  const seen = new Set<T>();
  for (const group of groups.values()) {
    const cued = group.filter((h) => h.cue);
    // A card the child's usual words ruled out here was someone else, not a
    // plain word.
    const weighed = cued.length ? cued : group;
    for (const h of weighed) seen.add(h.card);
    const live = weighed.filter((h) => h.verdict !== 'no');
    // Two people called Nam and nothing to tell them apart: ask, never guess.
    const shared = new Set(live.map((h) => h.card)).size > 1;
    for (const h of live) {
      const v: Verdict = shared ? 'ask' : h.verdict;
      const prev = best.get(h.card);
      if (!prev || RANK[v] > RANK[prev]) best.set(h.card, v);
    }
  }

  const out: Mentions<T> = { sure: [], unsure: [], words: [] };
  for (const card of cards) {
    const v = best.get(card);
    if (v === 'yes') out.sure.push(card);
    else if (v === 'ask') out.unsure.push(card);
    else if (seen.has(card) && alsoWord(card)) out.words.push(card);
  }
  return out;
}

// The cue worth remembering from how the child named a card: up to four
// words ending with the name ("con chó mực"), or null when it adds nothing.
export function cueFrom(called: string | null | undefined, name: string): string | null {
  const words = exactForm(called ?? '').split(' ').filter(Boolean);
  const own = exactForm(name).split(' ').filter(Boolean);
  if (!own.length) return null;
  for (let end = words.length; end >= own.length; end -= 1) {
    if (own.every((w, j) => words[end - own.length + j] === w)) {
      const cue = words.slice(Math.max(0, end - own.length - 3), end);
      return cue.length > own.length ? cue.join(' ') : null;
    }
  }
  return null;
}
