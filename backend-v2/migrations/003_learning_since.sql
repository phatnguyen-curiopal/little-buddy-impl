-- When learning was last switched on for a child. Nightly sleep summarises
-- only conversations that started after it, so a talk held while learning
-- was off is never written into Buddy's memory once it is switched back on.
-- NULL means learning has been on since the child was added.

ALTER TABLE child ADD COLUMN learning_since timestamptz;
