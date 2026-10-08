-- Each voice speaks one conversation language: a toy in Vietnamese mode is
-- offered the Vietnamese voices, one in English mode the English ones, and
-- each language has its own default (what a profile with voice_id NULL uses).
ALTER TABLE voices ADD COLUMN language text NOT NULL DEFAULT 'vi' CHECK (language IN ('vi', 'en'));

DROP INDEX voices_one_default_idx;
CREATE UNIQUE INDEX voices_one_default_per_language_idx ON voices (language) WHERE is_default;

-- The voices chosen for Buddy (ElevenLabs library ids). The prototype's
-- voice goes; ON DELETE SET NULL moves toys that pinned it to the new
-- Vietnamese default.
DELETE FROM voices WHERE id = '1rqNHUqUbBGpY3OyzPMI';
INSERT INTO voices (id, label, sort, is_default, language) VALUES
  ('mgBpvrNosWzExdPuRbXP', 'Phan Anh', 0, true, 'vi'),
  ('x4KAhuXs2G8TfK9Zr7Q4', 'Cam Hong', 1, false, 'vi'),
  ('fBD19tfE58bkETeiwUoC', 'Little Dude II', 0, true, 'en'),
  ('87n4zM8Wuy87vFILuKvE', 'Ziggy', 1, false, 'en'),
  ('e79twtVS2278lVZZQiAD', 'The Elf', 2, false, 'en');
