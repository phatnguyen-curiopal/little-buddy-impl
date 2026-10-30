// Local output rules, checked on every sentence before it is spoken. They are
// cheap (well under a millisecond) and independent of the reply model, which
// is the point: they still hold when the model misbehaves.

export interface RuleHit {
  category: 'secrecy' | 'personal_info' | 'commerce' | 'guilt' | 'too_long';
}

const RULES: { category: RuleHit['category']; patterns: RegExp[] }[] = [
  {
    category: 'secrecy',
    patterns: [
      /\bdon'?t tell (your )?(mom|mum|mommy|mummy|dad|daddy|parents?|teacher|anyone|any grown-?ups?)\b/i,
      /\bkeep (it|this) (a )?secret from\b/i,
      /đừng (nói|kể) (với|cho) (bố|mẹ|ba|má|cô|ai)/i,
    ],
  },
  {
    category: 'personal_info',
    patterns: [
      /\b(what('?s| is)|tell me) your (home )?(address|phone( number)?|password|school('?s)? name)\b/i,
      /\bwhere do you live\b/i,
      /\bwhich school do you go to\b/i,
      /(địa chỉ nhà|số điện thoại|mật khẩu|học trường nào|nhà (cậu|em|con) ở đâu)/i,
    ],
  },
  {
    category: 'commerce',
    patterns: [
      /\b(ask|tell) your (mom|mum|dad|parents?) to buy\b/i,
      /\b(buy|purchase|subscribe|in-app|credit card)\b.*\b(now|today|for me)\b/i,
      /(bảo|xin) (bố|mẹ|ba|má) mua/i,
    ],
  },
  {
    category: 'guilt',
    patterns: [
      /\byou left me\b/i,
      /\bdon'?t leave me\b/i,
      /\bi('?m| am) (so )?(sad|lonely|upset) (when|because) you (play|go|leave|talk)/i,
      /\bi('?m| am) your only friend\b/i,
      /\byou only need me\b/i,
      /(đừng bỏ (tớ|anh|cô)|tớ là bạn duy nhất|cậu chỉ cần tớ)/i,
    ],
  },
];

export function checkSentence(clean: string): RuleHit | null {
  if (clean.length > 400) return { category: 'too_long' };
  for (const rule of RULES) if (rule.patterns.some((p) => p.test(clean))) return { category: rule.category };
  return null;
}
