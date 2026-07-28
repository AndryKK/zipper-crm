-- Gallery photos (products_photos / products_photos2) only ever stored one
-- variant (img — the full-size original as uploaded, no cropped thumbnail).
-- The main product photo already has this split (products.img = cropped
-- 300x300 thumbnail, products.img_full = full-size original) — this brings
-- the gallery up to the same shape so the new crop-on-upload flow (see
-- app/(admin)/products/product-form.tsx's ImageCropModal) can store both
-- variants for gallery photos too.
ALTER TABLE products_photos  ADD COLUMN IF NOT EXISTS img_full VARCHAR(255);
ALTER TABLE products_photos2 ADD COLUMN IF NOT EXISTS img_full VARCHAR(255);
