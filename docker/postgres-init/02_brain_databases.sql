-- Buddy's brain keeps its memory in its own databases in the same pgvector
-- container. Runs only when the pgdata volume is first created; the brain's
-- `npm run migrate` and its test helpers create both databases (and the
-- extension) when missing, for volumes older than this file.
CREATE DATABASE littlebuddy_brain;
\c littlebuddy_brain
CREATE EXTENSION IF NOT EXISTS vector;

CREATE DATABASE littlebuddy_brain_test;
\c littlebuddy_brain_test
CREATE EXTENSION IF NOT EXISTS vector;
