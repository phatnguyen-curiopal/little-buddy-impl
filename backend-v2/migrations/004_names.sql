-- Names in context. A nickname is often an ordinary word (Mít is jackfruit,
-- Mực is squid), so each named thing keeps how the child says it ("bạn mít",
-- "con chó mực") and the ordinary meaning of its name, and a mention is read
-- from what surrounds it instead of by spelling. Named toys and places join
-- people and pets; school names and addresses are never stored.

ALTER TABLE person ADD COLUMN cues text[] NOT NULL DEFAULT '{}';  -- exact forms, tone marks kept, at most four
ALTER TABLE person ADD COLUMN also_word text;                     -- 'jackfruit' for Mít; null when the name is no word

ALTER TABLE person DROP CONSTRAINT person_kind_check;
ALTER TABLE person ADD CONSTRAINT person_kind_check
  CHECK (kind IN ('family', 'relative', 'friend', 'classmate', 'teacher', 'helper', 'pet', 'pretend', 'toy', 'place', 'other'));
