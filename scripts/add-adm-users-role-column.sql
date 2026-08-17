-- Adds adm_users.role — replaces the meaningless `status` text column
-- (every row already just said "administrator", so the CRM's old
-- "Активний"/"Заблокований" badge compared it to the number 1 and always
-- showed "Заблокований" for everyone) with real role-based access control.
-- See lib/roles.ts for the role list and what each one can access, and
-- proxy.ts for where it's enforced.
--
-- Existing accounts (mozar, zipper, admin) all had unrestricted access
-- before this — backfilled to 'superadmin' so nobody already using this
-- CRM gets locked out by this migration.
ALTER TABLE adm_users ADD COLUMN IF NOT EXISTS role VARCHAR(30) NOT NULL DEFAULT 'superadmin';

UPDATE adm_users SET role = 'superadmin' WHERE role IS NULL OR role = '';
