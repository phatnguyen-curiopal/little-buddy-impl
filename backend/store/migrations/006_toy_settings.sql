-- The voices a parent can pick for Buddy. id is the speech vendor's voice
-- id, sent to the brain as-is. Reference data: the test reset keeps it, and
-- at most one row is the default (what a profile with voice_id NULL uses).
CREATE TABLE voices (
  id          text PRIMARY KEY CHECK (id ~ '^[A-Za-z0-9_-]{1,64}$'),
  label       text NOT NULL CHECK (length(label) BETWEEN 1 AND 60),
  sort        int  NOT NULL DEFAULT 0,
  is_default  boolean NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX voices_one_default_idx ON voices (is_default) WHERE is_default;

-- The prototype's ElevenLabs voice (LittleBuddy/app-b/.env TTS_VOICE_ID).
INSERT INTO voices (id, label, sort, is_default) VALUES ('1rqNHUqUbBGpY3OyzPMI', 'Giọng mặc định', 0, true);

-- Per-toy conversation settings. voice_id NULL means "the default voice",
-- so changing the default moves every toy that never picked one; SET NULL
-- on delete for the same reason. learn defaults off: nothing a child says
-- is kept unless a parent turns it on. mood_pin NULL means Buddy's mood
-- follows its day; 0 is a real pin (the gloomiest mood), not "unset".
ALTER TABLE buddy_profiles
  ADD COLUMN language  text NOT NULL DEFAULT 'vi' CHECK (language IN ('vi', 'en')),
  ADD COLUMN voice_id  text REFERENCES voices(id) ON DELETE SET NULL,
  ADD COLUMN learn     boolean NOT NULL DEFAULT false,
  ADD COLUMN mood_pin  smallint CHECK (mood_pin BETWEEN 0 AND 100);

-- "New conversation" from the toy ends the open one explicitly instead of
-- waiting for the idle window.
ALTER TABLE conversations ADD COLUMN ended_at timestamptz;

-- Set when a parent reveals the secret to the web toy: an operator sees it
-- as "rotate before resale", since the secret has left the factory path.
ALTER TABLE devices ADD COLUMN secret_revealed_at timestamptz;
