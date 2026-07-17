-- Fixes the "Security Definer View" advisory: makes views run with the
-- querying user's permissions (and RLS) instead of the view creator's.
ALTER VIEW "filters" SET (security_invoker = on);
ALTER VIEW "filters_cat" SET (security_invoker = on);
ALTER VIEW "filters_cat_items" SET (security_invoker = on);
ALTER VIEW "filters_items" SET (security_invoker = on);
