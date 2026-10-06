-- How the website draws each toy: one of the three Buddy designs. Web only:
-- the physical toy and the brain never read it. Every existing toy becomes
-- the default design, and a claim writes it like any other profile field.
ALTER TABLE buddy_profiles
  ADD COLUMN design text NOT NULL DEFAULT 'orbit' CHECK (design IN ('orbit', 'volt', 'glim'));
