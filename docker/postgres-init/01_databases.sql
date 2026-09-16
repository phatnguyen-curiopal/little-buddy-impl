-- Runs only when the pgdata volume is first created. The test bootstrap also
-- creates this database if it is missing, for volumes older than this file.
CREATE DATABASE littlebuddy_test;
\c littlebuddy_test
CREATE EXTENSION IF NOT EXISTS vector;
