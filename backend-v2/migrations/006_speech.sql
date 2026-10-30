-- How one child speaks, so Buddy understands them better over time: what the
-- recogniser writes for what this child means ("đau lăn" for "đau răng"),
-- learned from the conversation or added by a parent, and the child's own
-- words a recogniser may miss (a toy's name, a cartoon), sent to speech
-- recognition as key terms.
CREATE TABLE speech_lexicon (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id      uuid NOT NULL REFERENCES child (id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('misheard', 'term')),
  heard         text NOT NULL,               -- as the recogniser writes it; for a term, the term itself
  meant         text NOT NULL,               -- what the child means
  source        text NOT NULL CHECK (source IN ('learned', 'parent')),
  seen          integer NOT NULL DEFAULT 1,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX speech_lexicon_uq ON speech_lexicon (child_id, kind, lower(heard));
