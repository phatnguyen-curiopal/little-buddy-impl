export interface DigestPerson {
  name: string;
  kind: string;
  relation: string | null;
}

// The always-included summary of the child, rebuilt nightly and cached.
export interface ChildDigest {
  name: string;
  nickname: string | null;
  ageYears: number | null;
  passions: string[];
  likes: string[];
  dislikes: string[];
  fears: string[];
  strengths: string[];
  people: DigestPerson[];
  topicsToAvoid: string[];
}

export interface RecallItem {
  kind: 'fact' | 'episode' | 'relationship' | 'canon';
  id: string;
  text: string;
  score: number;
  // The person a fact is about, so a name the child used as a plain word
  // does not pull that person's facts into the reply.
  personId?: string | null;
}

export interface DueItem {
  kind: 'event' | 'promise';
  id: string;
  text: string;
  due: string | null;
}

export interface PersonHit {
  id: string;
  display_name: string;
  kind: string;
  relation: string | null;
}

export interface RecallResult {
  people: PersonHit[];
  memories: RecallItem[];
  canon: RecallItem[];
  due: DueItem[];
  // Things the child used to find hard or scary that today's words touch.
  growth: RecallItem[];
  timedOut: boolean;
}

export const EMPTY_RECALL: RecallResult = { people: [], memories: [], canon: [], due: [], growth: [], timedOut: false };
