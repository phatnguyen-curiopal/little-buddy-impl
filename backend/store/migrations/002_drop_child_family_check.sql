-- Deleting a family fires ON DELETE SET NULL on devices.family_id before the
-- cascade through children clears devices.child_id, so the row transiently
-- has a child without a family and the check fails. The database cannot
-- order those two cascades; the rule "a child must belong to the toy's
-- family" is enforced in devices/registry.js at assignment time instead.
ALTER TABLE devices DROP CONSTRAINT devices_check;
