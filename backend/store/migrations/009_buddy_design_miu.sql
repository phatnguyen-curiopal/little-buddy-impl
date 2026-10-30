-- Miu, the talking kitten, joins the three robot designs and becomes the
-- design a new claim gets. Existing toys keep the design they have: it may be
-- one a parent chose, and nothing records which ones were only the default.
ALTER TABLE buddy_profiles DROP CONSTRAINT IF EXISTS buddy_profiles_design_check;
ALTER TABLE buddy_profiles
  ADD CONSTRAINT buddy_profiles_design_check CHECK (design IN ('miu', 'orbit', 'volt', 'glim')),
  ALTER COLUMN design SET DEFAULT 'miu';
