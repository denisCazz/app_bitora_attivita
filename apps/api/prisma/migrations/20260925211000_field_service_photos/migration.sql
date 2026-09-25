-- Photos for technical assistance: the sector card and each specialty inside it.
UPDATE "Category" SET "image" = 'asset:stove' WHERE "id" = 'cat_field_service' AND "image" IS NULL;
UPDATE "Category" SET "image" = 'asset:boiler' WHERE "id" = 'cat_boilers';
UPDATE "Category" SET "image" = 'asset:hvac' WHERE "id" = 'cat_hvac';
