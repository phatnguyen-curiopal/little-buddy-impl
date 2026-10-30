-- The schema from the "Database design" tab, as tested on the demo server.
-- Two departures, both to keep the database free of optional extensions:
-- emails are unique on lower(email) instead of citext, and misheard-name
-- matching runs in the app (src/memory/names.ts) instead of pg_trgm and
-- fuzzystrmatch, since a child has at most a few dozen person cards.
--
-- {{vec}} is replaced at migration time: halfvec on pgvector 0.7+, vector on
-- older servers such as the demo host (0.6.0). The vector extension itself is
-- created by the migration runner before this file runs.

-- Account and child -----------------------------------------------------------

CREATE TABLE family (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country    text NOT NULL DEFAULT 'VN',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE parent_user (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id     uuid NOT NULL REFERENCES family (id) ON DELETE CASCADE,
  email         text NOT NULL,
  display_name  text,
  auth_provider text NOT NULL CHECK (auth_provider IN ('email', 'apple', 'google')),
  auth_subject  text NOT NULL,
  role          text NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'guardian')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz,
  UNIQUE (auth_provider, auth_subject)
);
CREATE UNIQUE INDEX parent_user_email_uq ON parent_user (lower(email));

CREATE TABLE consent (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id  uuid NOT NULL REFERENCES family (id) ON DELETE CASCADE,
  parent_id  uuid NOT NULL REFERENCES parent_user (id) ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('terms', 'privacy', 'learning', 'pilot_review')),
  version    text NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE INDEX consent_family_idx ON consent (family_id, kind);

CREATE TABLE child (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id        uuid NOT NULL REFERENCES family (id) ON DELETE CASCADE,
  name             text NOT NULL,
  nickname         text,
  birth_date       date,
  languages        text[] NOT NULL DEFAULT '{vi}',
  time_zone        text NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
  city             text,                -- local weather for Buddy's diary
  learning_enabled boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX child_family_idx ON child (family_id);

-- Device ----------------------------------------------------------------------

CREATE TABLE device (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  serial           text NOT NULL UNIQUE,
  hardware_rev     text NOT NULL,
  firmware_version text,
  status           text NOT NULL DEFAULT 'provisioned'
                   CHECK (status IN ('provisioned', 'active', 'disabled', 'revoked')),
  family_id        uuid REFERENCES family (id) ON DELETE SET NULL,
  child_id         uuid REFERENCES child (id) ON DELETE SET NULL,
  claimed_at       timestamptz,
  last_seen_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);
-- One child per toy comes from the single child_id column; this index allows one active toy per child.
CREATE UNIQUE INDEX device_active_child_uq ON device (child_id) WHERE status = 'active';

CREATE TABLE device_credential (
  device_id     uuid PRIMARY KEY REFERENCES device (id) ON DELETE CASCADE,
  secret_sealed bytea NOT NULL,         -- sealed with a key derived from DEVICE_KEK, never stored in plain text
  key_version   smallint NOT NULL,
  rotated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE device_event (
  id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  device_id uuid NOT NULL REFERENCES device (id) ON DELETE CASCADE,
  kind      text NOT NULL CHECK (kind IN ('provisioned', 'claimed', 'unclaimed', 'disabled', 'enabled', 'revoked', 'firmware_updated')),
  actor     text NOT NULL,              -- 'parent:<id>', 'staff:<id>' or 'system'
  at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX device_event_device_idx ON device_event (device_id, at DESC);

CREATE TABLE firmware_release (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version         text NOT NULL,
  hardware_rev    text NOT NULL,
  image_key       text NOT NULL,        -- S3 key of the signed image
  sha256          bytea NOT NULL,
  signature       bytea NOT NULL,
  rollout_percent smallint NOT NULL DEFAULT 0 CHECK (rollout_percent BETWEEN 0 AND 100),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hardware_rev, version)
);

-- Character -------------------------------------------------------------------

CREATE TABLE buddy_character (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       text NOT NULL UNIQUE,      -- 'bo'
  name       text NOT NULL,
  status     text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'released', 'retired')),
  profile    jsonb NOT NULL,            -- dial profile and theme tags read by the matcher
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE character_pack_version (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id uuid NOT NULL REFERENCES buddy_character (id),
  version      integer NOT NULL,
  bible        jsonb NOT NULL,          -- identity, favourites, quirks, catchphrases, values
  life_rules   jsonb NOT NULL,          -- the plausible-life rule for this character
  dial_ranges  jsonb NOT NULL,
  voices       jsonb NOT NULL,          -- ElevenLabs voice id and settings per language
  reviewed_by  text NOT NULL,
  released_at  timestamptz,
  UNIQUE (character_id, version)
);

CREATE TABLE character_instance (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id           uuid NOT NULL REFERENCES child (id) ON DELETE CASCADE,
  character_id       uuid NOT NULL REFERENCES buddy_character (id),
  pack_version_id    uuid NOT NULL REFERENCES character_pack_version (id),
  status             text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  role               text NOT NULL CHECK (role IN ('friend', 'sibling', 'parent_figure', 'teacher')),
  language_mode      text NOT NULL CHECK (language_mode IN ('vi', 'en', 'bilingual')),
  energy             smallint NOT NULL CHECK (energy BETWEEN 0 AND 100),
  playfulness        smallint NOT NULL CHECK (playfulness BETWEEN 0 AND 100),
  curiosity          smallint NOT NULL CHECK (curiosity BETWEEN 0 AND 100),
  warmth             smallint NOT NULL CHECK (warmth BETWEEN 0 AND 100),
  structure          smallint NOT NULL CHECK (structure BETWEEN 0 AND 100),
  relationship_stage text NOT NULL DEFAULT 'meeting'
                     CHECK (relationship_stage IN ('meeting', 'buddies', 'best_friends')),
  met_on             date NOT NULL,     -- Buddy's birthday: the day they first met
  created_at         timestamptz NOT NULL DEFAULT now()
);
-- Changing character archives the old friendship, so only one Buddy is active per child.
CREATE UNIQUE INDEX character_instance_active_uq ON character_instance (child_id) WHERE status = 'active';

CREATE TABLE questionnaire_response (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id             uuid NOT NULL REFERENCES child (id) ON DELETE CASCADE,
  answers              jsonb NOT NULL,
  target_profile       jsonb NOT NULL,
  matched_character_id uuid NOT NULL REFERENCES buddy_character (id),
  match_score          real NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX questionnaire_child_idx ON questionnaire_response (child_id, created_at DESC);

-- Sessions, safety and usage --------------------------------------------------

CREATE TABLE chat_session (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id     uuid NOT NULL REFERENCES child (id) ON DELETE CASCADE,
  instance_id  uuid NOT NULL REFERENCES character_instance (id) ON DELETE CASCADE,
  device_id    uuid REFERENCES device (id) ON DELETE SET NULL,
  started_at   timestamptz NOT NULL DEFAULT now(),
  ended_at     timestamptz,
  turns        integer NOT NULL DEFAULT 0,
  talk_seconds integer NOT NULL DEFAULT 0
);
CREATE INDEX chat_session_child_idx ON chat_session (child_id, started_at DESC);

-- The only table that holds the child's words: one partition per UTC day, dropped after 30 days.
CREATE TABLE turn (
  id         uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  session_id uuid NOT NULL REFERENCES chat_session (id) ON DELETE CASCADE,
  child_id   uuid NOT NULL REFERENCES child (id) ON DELETE CASCADE,
  child_text text NOT NULL,
  reply_text text NOT NULL,
  face       text NOT NULL,
  turn_type  text NOT NULL,
  language   text NOT NULL CHECK (language IN ('vi', 'en', 'mixed')),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);
CREATE INDEX turn_child_idx ON turn (child_id, created_at DESC);

CREATE TABLE safety_event (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id           uuid NOT NULL REFERENCES child (id) ON DELETE CASCADE,
  session_id         uuid REFERENCES chat_session (id) ON DELETE SET NULL,
  turn_id            uuid,              -- soft reference: the turn itself is dropped after 30 days
  severity           text NOT NULL CHECK (severity IN ('info', 'concern', 'urgent')),
  category           text NOT NULL,     -- 'hurt', 'bullying', 'self_harm', 'personal_info', ...
  detected_by        text NOT NULL CHECK (detected_by IN ('input', 'output', 'classifier')),
  excerpt            text,              -- set for concern and urgent: the only child's words a parent sees
  parent_notified_at timestamptz,
  acknowledged_at    timestamptz,
  review_status      text NOT NULL DEFAULT 'none' CHECK (review_status IN ('none', 'queued', 'reviewed')),
  reviewed_by        text,
  reviewed_at        timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX safety_event_child_idx ON safety_event (child_id, created_at DESC);
CREATE INDEX safety_event_queue_idx ON safety_event (created_at) WHERE review_status = 'queued';

CREATE TABLE usage_daily (
  child_id      uuid NOT NULL REFERENCES child (id) ON DELETE CASCADE,
  day           date NOT NULL,          -- the child's local date
  turns         integer NOT NULL DEFAULT 0,
  talk_seconds  integer NOT NULL DEFAULT 0,
  stt_seconds   integer NOT NULL DEFAULT 0,
  tokens_in     bigint NOT NULL DEFAULT 0,
  tokens_cached bigint NOT NULL DEFAULT 0,
  tokens_out    bigint NOT NULL DEFAULT 0,
  tts_chars     bigint NOT NULL DEFAULT 0,
  cost_micros   bigint NOT NULL DEFAULT 0,  -- millionths of a US dollar, from the model gateway
  PRIMARY KEY (child_id, day)
);

CREATE TABLE nightly_run (
  child_id    uuid NOT NULL REFERENCES child (id) ON DELETE CASCADE,
  day         date NOT NULL,
  status      text NOT NULL CHECK (status IN ('queued', 'batched', 'done', 'failed')),
  batch_id    text,                     -- OpenAI Batch API job id
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  PRIMARY KEY (child_id, day)
);

-- Child model -----------------------------------------------------------------

CREATE TABLE person (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id           uuid NOT NULL REFERENCES child (id) ON DELETE CASCADE,
  display_name       text NOT NULL,
  name_key           text NOT NULL,     -- accent-free lower-case name, written by the app
  aliases            text[] NOT NULL DEFAULT '{}',  -- other name keys the child uses
  kind               text NOT NULL CHECK (kind IN ('family', 'relative', 'friend', 'classmate', 'teacher', 'helper', 'pet', 'pretend', 'other')),
  relation           text,              -- 'grandmother', 'best friend', 'cat'
  details            jsonb NOT NULL DEFAULT '{}',
  feeling            real NOT NULL DEFAULT 0 CHECK (feeling BETWEEN -1 AND 1),
  closeness          real NOT NULL DEFAULT 0 CHECK (closeness BETWEEN 0 AND 1),
  mentions           integer NOT NULL DEFAULT 1,
  first_mentioned_at timestamptz NOT NULL DEFAULT now(),
  last_mentioned_at  timestamptz NOT NULL DEFAULT now(),
  status             text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'merged')),
  merged_into        uuid REFERENCES person (id) ON DELETE SET NULL,
  embedding          {{vec}}(1536)
);
CREATE INDEX person_child_idx ON person (child_id, name_key);

CREATE TABLE child_event (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id      uuid NOT NULL REFERENCES child (id) ON DELETE CASCADE,
  person_id     uuid REFERENCES person (id) ON DELETE SET NULL,
  kind          text NOT NULL CHECK (kind IN ('routine', 'upcoming', 'milestone')),
  description   text NOT NULL,          -- 'swim class', 'Bao''s birthday party', 'lost a tooth'
  starts_on     date,
  ends_on       date,
  recurrence    text,                   -- iCalendar RRULE, for routines
  follow_up_due timestamptz,
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'followed_up', 'done', 'cancelled')),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX child_event_due_idx ON child_event (child_id, follow_up_due) WHERE status = 'open';

CREATE TABLE episode (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id     uuid NOT NULL REFERENCES child (id) ON DELETE CASCADE,
  session_id   uuid REFERENCES chat_session (id) ON DELETE SET NULL,
  started_at   timestamptz NOT NULL,
  ended_at     timestamptz NOT NULL,
  points       jsonb NOT NULL,          -- numbered summary points, edited by id
  feelings     text[] NOT NULL DEFAULT '{}',
  open_threads jsonb NOT NULL DEFAULT '[]',
  category     text CHECK (category IN ('family', 'school', 'friends', 'pets', 'feelings', 'play', 'daily_life', 'other')),
  importance   smallint NOT NULL DEFAULT 1 CHECK (importance BETWEEN 1 AND 5),
  embedding    {{vec}}(1536)
);
CREATE INDEX episode_child_idx ON episode (child_id, ended_at DESC);
CREATE UNIQUE INDEX episode_session_uq ON episode (session_id) WHERE session_id IS NOT NULL;

CREATE TABLE fact (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id      uuid NOT NULL REFERENCES child (id) ON DELETE CASCADE,
  person_id     uuid REFERENCES person (id) ON DELETE CASCADE,  -- set when the fact is about someone else
  category      text NOT NULL CHECK (category IN ('basics', 'likes', 'dislikes', 'fears', 'strengths', 'growing_edges', 'feelings', 'routines', 'passions', 'play_style', 'dreams', 'family', 'other')),
  statement     text NOT NULL,          -- 'loves mangoes'
  source        text NOT NULL CHECK (source IN ('child', 'parent', 'setup', 'inferred')),
  confidence    real NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  weight        real NOT NULL DEFAULT 1, -- lowered nightly when stale; facts are never deleted for age
  mentions      integer NOT NULL DEFAULT 1,
  reality       text NOT NULL DEFAULT 'real' CHECK (reality IN ('real', 'pretend')),
  sensitivity   text NOT NULL DEFAULT 'normal' CHECK (sensitivity IN ('normal', 'sensitive')),
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded')),
  superseded_by uuid REFERENCES fact (id) ON DELETE SET NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  embedding     {{vec}}(1536)
);
CREATE INDEX fact_child_idx ON fact (child_id, status, category);
CREATE INDEX fact_person_idx ON fact (person_id) WHERE person_id IS NOT NULL;

CREATE TABLE fact_evidence (
  fact_id     uuid NOT NULL REFERENCES fact (id) ON DELETE CASCADE,
  turn_id     uuid NOT NULL,            -- soft reference: turns are dropped after 30 days
  episode_id  uuid REFERENCES episode (id) ON DELETE SET NULL,
  observed_at timestamptz NOT NULL,
  PRIMARY KEY (fact_id, turn_id)
);

CREATE TABLE relationship_item (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id     uuid NOT NULL REFERENCES child (id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('inside_joke', 'nickname', 'ritual', 'promise', 'shared_story', 'secret_greeting')),
  content      text NOT NULL,
  due_at       timestamptz,             -- promises only
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'kept', 'expired', 'retired')),
  last_used_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  embedding    {{vec}}(1536)
);
CREATE INDEX relationship_child_idx ON relationship_item (child_id, kind, status);
CREATE INDEX relationship_promise_due_idx ON relationship_item (child_id, due_at)
  WHERE kind = 'promise' AND status = 'active';

CREATE TABLE trait (
  child_id          uuid NOT NULL REFERENCES child (id) ON DELETE CASCADE,
  name              text NOT NULL,      -- 'outgoing', 'cautious', 'sensitive'
  value             real NOT NULL CHECK (value BETWEEN -1 AND 1),
  confidence        real NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  observations      integer NOT NULL DEFAULT 1,
  first_observed_at timestamptz NOT NULL DEFAULT now(),
  last_observed_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (child_id, name)
);

CREATE TABLE what_works (
  child_id   uuid NOT NULL REFERENCES child (id) ON DELETE CASCADE,
  key        text NOT NULL,             -- 'play:riddles', 'comfort:distraction', 'length:short'
  attempts   integer NOT NULL DEFAULT 0,
  successes  integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (child_id, key)
);

-- Buddy's life ----------------------------------------------------------------

CREATE TABLE buddy_canon (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL REFERENCES character_instance (id) ON DELETE CASCADE,
  statement   text NOT NULL,            -- 'my favourite song is the rain song'
  topic       text,
  source      text NOT NULL CHECK (source IN ('said', 'diary')),
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retracted')),
  turn_id     uuid,                     -- soft reference to where Buddy said it
  created_at  timestamptz NOT NULL DEFAULT now(),
  embedding   {{vec}}(1536)
);
CREATE INDEX buddy_canon_instance_idx ON buddy_canon (instance_id, status);

CREATE TABLE story_arc (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id  uuid NOT NULL REFERENCES character_instance (id) ON DELETE CASCADE,
  title        text NOT NULL,           -- 'the bean plant'
  beats        jsonb NOT NULL,          -- planned beats: start, setbacks, payoff
  current_beat smallint NOT NULL DEFAULT 0,
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'done')),
  started_on   date NOT NULL,
  ended_on     date
);

CREATE TABLE diary_entry (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL REFERENCES character_instance (id) ON DELETE CASCADE,
  day         date NOT NULL,            -- the child's local date
  slot        smallint NOT NULL CHECK (slot BETWEEN 1 AND 3),
  story       text NOT NULL,
  valence     text NOT NULL DEFAULT 'normal' CHECK (valence IN ('bright', 'normal', 'grey')),
  arc_id      uuid REFERENCES story_arc (id) ON DELETE SET NULL,
  UNIQUE (instance_id, day, slot)
);

CREATE TABLE mood_day (
  instance_id uuid NOT NULL REFERENCES character_instance (id) ON DELETE CASCADE,
  day         date NOT NULL,
  mood        smallint NOT NULL CHECK (mood BETWEEN 0 AND 100),
  source      text NOT NULL CHECK (source IN ('computed', 'pinned')),
  PRIMARY KEY (instance_id, day)
);

-- Parent features -------------------------------------------------------------

CREATE TABLE child_controls (
  child_id        uuid PRIMARY KEY REFERENCES child (id) ON DELETE CASCADE,
  daily_limit_min smallint CHECK (daily_limit_min BETWEEN 5 AND 240),
  quiet_start     time,
  quiet_end       time,
  bedtime         time NOT NULL DEFAULT '20:30',
  topics_to_avoid text[] NOT NULL DEFAULT '{}',
  mood_pin        smallint CHECK (mood_pin BETWEEN 0 AND 100),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE digest (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id   uuid NOT NULL REFERENCES child (id) ON DELETE CASCADE,
  week_start date NOT NULL,
  content    jsonb NOT NULL,            -- highlights, new interests, mood trend, people, conversation starters
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (child_id, week_start)
);

CREATE TABLE nudge (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id   uuid NOT NULL REFERENCES child (id) ON DELETE CASCADE,
  parent_id  uuid NOT NULL REFERENCES parent_user (id) ON DELETE CASCADE,
  content    text NOT NULL,             -- 'Grandma visits on Saturday'
  use_after  timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  status     text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'used', 'expired', 'cancelled')),
  used_at    timestamptz
);
CREATE INDEX nudge_pending_idx ON nudge (child_id, use_after) WHERE status = 'pending';

CREATE TABLE goal (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id   uuid NOT NULL REFERENCES child (id) ON DELETE CASCADE,
  focus      text NOT NULL,             -- 'sharing', 'english_words', 'bedtime_routine'
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notification (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid NOT NULL REFERENCES parent_user (id) ON DELETE CASCADE,
  child_id  uuid NOT NULL REFERENCES child (id) ON DELETE CASCADE,
  kind      text NOT NULL CHECK (kind IN ('safety_alert', 'digest')),
  ref_id    uuid NOT NULL,              -- the safety_event or digest it points to
  sent_at   timestamptz NOT NULL DEFAULT now(),
  read_at   timestamptz
);
CREATE INDEX notification_parent_idx ON notification (parent_id, sent_at DESC);
