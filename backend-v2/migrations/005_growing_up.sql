-- Growing up together (roadmap phase 3): traits learned over weeks, the
-- growth mirror, the child's tone of voice, bilingual play and games.

-- A parent can switch off games with a playful startle ("hù", "ú òa"), and
-- must opt in before Buddy may ever speak first (off by default, and also off
-- for the whole service until the operator allows it).
ALTER TABLE child_controls ADD COLUMN surprise_play boolean NOT NULL DEFAULT true;
ALTER TABLE child_controls ADD COLUMN speak_first boolean NOT NULL DEFAULT false;

-- When Buddy last reflected this growing edge or fear back as growth, so the
-- same "remember when" does not come round again within a month.
ALTER TABLE fact ADD COLUMN mirrored_at timestamptz;

-- The child's usual voice, so a quiet or excited turn is judged against the
-- child, not against an adult: a running mean and spread (Welford) per measure.
CREATE TABLE voice_baseline (
  child_id      uuid PRIMARY KEY REFERENCES child (id) ON DELETE CASCADE,
  turns         integer NOT NULL DEFAULT 0,
  loudness_mean real NOT NULL DEFAULT 0,      -- dBFS over voiced frames
  loudness_m2   real NOT NULL DEFAULT 0,
  pitch_mean    real NOT NULL DEFAULT 0,      -- Hz
  pitch_m2      real NOT NULL DEFAULT 0,
  pace_mean     real NOT NULL DEFAULT 0,      -- words per voiced second
  pace_m2       real NOT NULL DEFAULT 0,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Second-language words met in play, taught by Buddy or said by the child,
-- reviewed on a widening schedule.
CREATE TABLE word_bank (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id       uuid NOT NULL REFERENCES child (id) ON DELETE CASCADE,
  word           text NOT NULL,
  word_key       text NOT NULL,              -- lower case, one row per word
  language       text NOT NULL CHECK (language IN ('vi', 'en')),
  meaning        text,                       -- in the child's other language
  taught         integer NOT NULL DEFAULT 0,
  used           integer NOT NULL DEFAULT 0,
  first_seen_at  timestamptz NOT NULL DEFAULT now(),
  last_seen_at   timestamptz NOT NULL DEFAULT now(),
  next_review_at timestamptz NOT NULL DEFAULT now() + interval '1 day'
);
CREATE UNIQUE INDEX word_bank_word_uq ON word_bank (child_id, language, word_key);
