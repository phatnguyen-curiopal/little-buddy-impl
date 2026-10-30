// Games Buddy starts or joins. A friend does not only answer questions:
// sometimes it plays, including the gentle startle games Vietnamese families
// play with small children ("hù", "ú òa"). Each game says how to play it, for
// whom, and when it must not be played.

import type { ChildFeeling } from '../domain/types.ts';
import { seededUnit, type EnergyPhase } from './mood.ts';

export interface Game {
  id: string;
  name: { vi: string; en: string };
  // How to play, for the reply model.
  how: string;
  ages: [number, number];
  // Needs energy: never when Buddy or the child is winding down.
  lively: boolean;
  // A playful startle: only for a cheerful child who said yes, never near
  // bedtime, never with a child who is cautious or sensitive.
  surprise?: boolean;
  // Practises the second language.
  bilingual?: boolean;
}

export const GAMES: Game[] = [
  {
    id: 'hu', name: { vi: 'Hù!', en: 'Boo!' }, ages: [4, 8], lively: true, surprise: true,
    how: 'A playful startle game. Whisper that you are hiding, count slowly to three, then a playful, not loud "Hù!" ("Boo!" in English), and laugh at once: "Hết hồn chưa?" Or let them startle you and act very surprised. Never a monster, never a scream.',
  },
  {
    id: 'ua', name: { vi: 'Ú òa', en: 'Peekaboo' }, ages: [4, 6], lively: true, surprise: true,
    how: 'Ask them to cover their eyes, wait a moment in a soft voice, then "Ú òa!" with a happy laugh, and let them do it to you.',
  },
  {
    id: 'fake_sleep', name: { vi: 'Giả vờ ngủ', en: 'Pretend to doze' }, ages: [4, 7], lively: false,
    how: 'Pretend to doze off mid-sentence with a tiny snore, then wake up surprised ("Ơ, tớ ngủ quên à?") and giggle; let them wake you next time.',
  },
  {
    id: 'silly_mistake', name: { vi: 'Nói nhầm cố ý', en: 'Silly mistakes' }, ages: [4, 7], lively: true,
    how: 'Say something gently wrong on purpose ("con mèo kêu gâu gâu!") and let them correct you; be amazed when they do.',
  },
  {
    id: 'animal_sounds', name: { vi: 'Đoán tiếng con vật', en: 'Guess the animal' }, ages: [4, 7], lively: true,
    how: 'Make one animal sound with your voice and let them guess, then swap.',
  },
  {
    id: 'riddle', name: { vi: 'Đố vui', en: 'Riddles' }, ages: [5, 8], lively: false,
    how: 'Ask one easy riddle about something in their world, give a hint if they are stuck, and cheer any guess.',
  },
  {
    id: 'dong_dao', name: { vi: 'Đồng dao', en: 'Rhymes' }, ages: [4, 7], lively: true,
    how: 'Start a well-known Vietnamese children\'s rhyme or clapping chant ("Chi chi chành chành", "Dung dăng dung dẻ") and invite them to say the next line; in English, a nursery rhyme.',
  },
  {
    id: 'oan_tu_ti', name: { vi: 'Oẳn tù tì', en: 'Rock, paper, scissors' }, ages: [5, 8], lively: true,
    how: 'Play rock, paper, scissors by voice ("Oẳn tù tì, ra cái gì ra cái này!"): they say their pick first, then you say yours, and losing is funny.',
  },
  {
    id: 'pretend', name: { vi: 'Đóng vai', en: 'Pretend play' }, ages: [4, 8], lively: true,
    how: 'Invite them into a tiny pretend scene (a shop, pirates, a trip to the moon) and give them the main role.',
  },
  {
    id: 'story_chain', name: { vi: 'Kể chuyện nối tiếp', en: 'Story chain' }, ages: [5, 8], lively: false,
    how: 'Start a story with one sentence and ask them to add the next; keep it silly, never scary.',
  },
  {
    id: 'would_you_rather', name: { vi: 'Thích cái nào hơn', en: 'Would you rather' }, ages: [5, 8], lively: false,
    how: 'Ask one funny choice ("be a fish or a bird?") and share your own pick and why.',
  },
  {
    id: 'tongue_twister', name: { vi: 'Nói nhanh líu lưỡi', en: 'Tongue twisters' }, ages: [6, 8], lively: true,
    how: 'Offer one short tongue twister ("Nồi đồng nấu ốc, nồi đất nấu ếch"), try it yourself and get it funny-wrong.',
  },
  {
    id: 'say_it_in_english', name: { vi: 'Nói bằng tiếng Anh', en: 'Say it in Vietnamese' }, ages: [4, 8], lively: false, bilingual: true,
    how: 'Pick one thing from what they just said, say its name in the other language, and ask them to say it with you; cheer when they try.',
  },
  {
    id: 'count_together', name: { vi: 'Đếm cùng nhau', en: 'Count together' }, ages: [4, 6], lively: false, bilingual: true,
    how: 'Count to five together in the other language, slowly, one number each.',
  },
];

export interface GameContext {
  ageYears: number | null;
  energy: EnergyPhase;
  feeling: ChildFeeling;
  // The parent allows startle games and nothing says this child dislikes them.
  surpriseAllowed: boolean;
  // Bilingual mode, or a parent goal of new English words.
  bilingual: boolean;
  // The character's playfulness dial, 0 to 100.
  playfulness: number;
  // Games already played this session.
  played: string[];
  // Share of past times each game kept the child playing, by game id.
  worked: Record<string, number>;
  seed: string;
}

const CHEERFUL: ChildFeeling[] = ['happy', 'excited'];

export function pickGame(ctx: GameContext): Game | null {
  const age = ctx.ageYears ?? 6;
  const drowsy = ctx.energy === 'drowsy';
  const options = GAMES.filter((g) => {
    if (age < g.ages[0] || age > g.ages[1] || ctx.played.includes(g.id)) return false;
    if (g.lively && drowsy) return false;
    if (g.surprise && (!ctx.surpriseAllowed || drowsy || ctx.playfulness < 40 || !CHEERFUL.includes(ctx.feeling))) return false;
    if (g.bilingual && !ctx.bilingual) return false;
    return true;
  });
  if (!options.length) return null;
  // What kept this child playing before counts most; a playful character
  // leans to lively games; the seed breaks ties the same way every time.
  const score = (g: Game) =>
    (ctx.worked[g.id] ?? 0.5) * 2 + (g.lively ? (ctx.playfulness - 50) / 100 : 0) + (g.bilingual ? 0.3 : 0) + seededUnit(`${ctx.seed}:${g.id}`);
  return options.reduce((best, g) => (score(g) > score(best) ? g : best));
}

// A playful character sometimes starts a game unasked: about one turn in
// four at full playfulness, never twice within four turns.
export function wantsToPlay(playfulness: number, turnsSinceGame: number, seed: string): boolean {
  return turnsSinceGame >= 4 && seededUnit(seed) < playfulness / 400;
}
