-- Buddy's brain: every memory row is scoped by `subject`, a string the
-- backend builds ("child:<uuid>" or "device:<uuid>:<family uuid>"). Nothing
-- here references the backend's tables; the brain never sees a family, only
-- the subject it is asked to remember for.
--
-- Vectors are text-embedding-3-large at full width (3072). pgvector cannot
-- build an HNSW index past 2000 dimensions, so search is an exact sequential
-- scan per subject, which is not measurable at one family's scale.

CREATE EXTENSION IF NOT EXISTS vector;

-- One row per remembered exchange, the child's words verbatim.
CREATE TABLE exchanges (
  id              bigserial PRIMARY KEY,
  subject         text NOT NULL,
  conversation_id text NOT NULL,
  user_text       text NOT NULL,
  assistant_text  text NOT NULL,
  embedding       vector(3072) NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX exchanges_subject_created_idx ON exchanges (subject, created_at DESC);
CREATE INDEX exchanges_subject_conversation_idx ON exchanges (subject, conversation_id);

-- Proper names the child mentions. `name` is the lowercased key so "Bông"
-- and "bông" count as one; `contexts` holds up to MEMORY_NAME_CONTEXTS notes,
-- one per conversation, newest first.
CREATE TABLE familiar_names (
  subject    text NOT NULL,
  name       text NOT NULL,
  display    text NOT NULL,
  kind       text NOT NULL DEFAULT 'other' CHECK (kind IN ('friend', 'pet', 'family', 'other')),
  count      integer NOT NULL DEFAULT 1,
  last_heard timestamptz NOT NULL DEFAULT now(),
  contexts   jsonb NOT NULL DEFAULT '[]'::jsonb,
  age        text,
  relation   text,
  species    text,
  PRIMARY KEY (subject, name)
);

-- Durable facts about the child. The embedding is nullable: a fact is
-- usable by recency the moment it is written and ranks once its vector lands.
CREATE TABLE child_facts (
  id          bigserial PRIMARY KEY,
  subject     text NOT NULL,
  category    text NOT NULL CHECK (category IN ('likes', 'dislikes', 'fears', 'family')),
  fact        text NOT NULL,
  count       integer NOT NULL DEFAULT 1,
  first_heard timestamptz NOT NULL DEFAULT now(),
  last_heard  timestamptz NOT NULL DEFAULT now(),
  embedding   vector(3072)
);
CREATE UNIQUE INDEX child_facts_fact_idx ON child_facts (subject, category, lower(fact));

-- One rolling summary per conversation. Text ids so the prototype's "c-..."
-- ids import unchanged. `next_id` never reuses a point id: the extractor
-- addresses points by id, and a recycled one would land an update on the
-- wrong point.
CREATE TABLE conversation_summaries (
  subject         text NOT NULL,
  conversation_id text NOT NULL,
  points          jsonb NOT NULL DEFAULT '[]'::jsonb,
  next_id         integer NOT NULL DEFAULT 1,
  category        text CHECK (category IN ('family', 'school', 'friends', 'pets', 'feelings', 'daily_life', 'other')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  embedding       vector(3072),
  PRIMARY KEY (subject, conversation_id)
);
CREATE INDEX conversation_summaries_recent_idx ON conversation_summaries (subject, updated_at DESC);

-- Buddy's own life, per role and language. Diary text is prompt material
-- only and is never embedded, so an invented story can never be recalled as
-- something the child said.
CREATE TABLE backstories (
  role      text NOT NULL CHECK (role IN ('friend', 'daddy', 'mommy', 'teacher')),
  lang      text NOT NULL CHECK (lang IN ('vi', 'en')),
  backstory text NOT NULL,
  PRIMARY KEY (role, lang)
);

CREATE TABLE diary (
  role    text NOT NULL CHECK (role IN ('friend', 'daddy', 'mommy', 'teacher')),
  lang    text NOT NULL CHECK (lang IN ('vi', 'en')),
  day     date NOT NULL,
  story   text NOT NULL,
  valence text NOT NULL DEFAULT 'normal' CHECK (valence IN ('bright', 'normal', 'grey')),
  PRIMARY KEY (role, lang, day)
);

-- One mood per toy per Vietnam calendar day. The reason is stored as the
-- diary day that tilted the dice rather than as text, so it renders in
-- whichever language the toy speaks when the prompt is built.
CREATE TABLE moods (
  device_id  uuid NOT NULL,
  day        date NOT NULL,
  score      smallint NOT NULL CHECK (score BETWEEN 0 AND 100),
  reason_day date,
  PRIMARY KEY (device_id, day)
);
