-- Suggested income and expense categories for every activity. Children inherit them
-- and replace only the side they set themselves.
UPDATE "Category"
SET "presets" = COALESCE("presets", '{}'::jsonb) || '{"ledger":{"income":["Interventi","Ricambi","Contratti"],"expense":["Materiali","Carburante","Attrezzatura","Affitto","Personale"]}}'::jsonb,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'field_service';

UPDATE "Category"
SET "presets" = COALESCE("presets", '{}'::jsonb) || '{"ledger":{"income":["Sala","Asporto","Bar"],"expense":["Materie prime","Personale","Affitto","Utenze"]}}'::jsonb,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'hospitality';

UPDATE "Category"
SET "presets" = COALESCE("presets", '{}'::jsonb) || '{"ledger":{"income":["Servizi","Prodotti","Abbonamenti"],"expense":["Prodotti","Personale","Affitto","Utenze"]}}'::jsonb,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'wellness';

UPDATE "Category"
SET "presets" = COALESCE("presets", '{}'::jsonb) || '{"ledger":{"income":["Incassi","Servizi"],"expense":["Fornitori","Affitto","Personale","Utenze"]}}'::jsonb,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'generic';

UPDATE "Category"
SET "presets" = COALESCE("presets", '{}'::jsonb) || '{"ledger":{"income":["Manodopera","Ricambi","Tagliandi"],"expense":["Ricambi","Pneumatici","Attrezzatura","Affitto","Personale"]}}'::jsonb,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'mechanic';

UPDATE "Category"
SET "presets" = COALESCE("presets", '{}'::jsonb) || '{"ledger":{"income":["Interventi","Piante"],"expense":["Piante","Carburante","Attrezzatura","Affitto"]}}'::jsonb,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'garden';

UPDATE "Category"
SET "presets" = COALESCE("presets", '{}'::jsonb) || '{"ledger":{"income":["Lavori","Materiali"],"expense":["Legno","Ferramenta","Attrezzatura","Affitto"]}}'::jsonb,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'carpentry';

UPDATE "Category"
SET "presets" = COALESCE("presets", '{}'::jsonb) || '{"ledger":{"income":["Banco","Cucina","Asporto"],"expense":["Materie prime","Personale","Affitto","Utenze"]}}'::jsonb,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'bar';

UPDATE "Category"
SET "presets" = COALESCE("presets", '{}'::jsonb) || '{"ledger":{"income":["Sala","Asporto","Bar"],"expense":["Materie prime","Personale","Affitto","Utenze"]}}'::jsonb,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'restaurant';

UPDATE "Category"
SET "presets" = COALESCE("presets", '{}'::jsonb) || '{"ledger":{"income":["Gelato","Bar","Asporto"],"expense":["Materie prime","Personale","Affitto","Utenze"]}}'::jsonb,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'gelato';

UPDATE "Category"
SET "presets" = COALESCE("presets", '{}'::jsonb) || '{"ledger":{"income":["Pane","Pasticceria","Bar"],"expense":["Materie prime","Personale","Affitto","Utenze"]}}'::jsonb,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'bakery';

UPDATE "Category"
SET "presets" = COALESCE("presets", '{}'::jsonb) || '{"ledger":{"income":["Semipermanente","Ricostruzione","Prodotti"],"expense":["Prodotti","Affitto","Personale"]}}'::jsonb,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'nails';

UPDATE "Category"
SET "presets" = COALESCE("presets", '{}'::jsonb) || '{"ledger":{"income":["Taglio","Colore","Prodotti"],"expense":["Prodotti","Personale","Affitto","Utenze"]}}'::jsonb,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'hair';

UPDATE "Category"
SET "presets" = COALESCE("presets", '{}'::jsonb) || '{"ledger":{"income":["Trattamenti","Abbonamenti","Prodotti"],"expense":["Prodotti","Personale","Affitto","Utenze"]}}'::jsonb,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'spa';

UPDATE "Category"
SET "presets" = COALESCE("presets", '{}'::jsonb) || '{"ledger":{"income":["Taglio","Barba","Prodotti"],"expense":["Prodotti","Affitto","Personale"]}}'::jsonb,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'barber';

UPDATE "Category"
SET "presets" = COALESCE("presets", '{}'::jsonb) || '{"ledger":{"income":["Abbonamenti","Ingressi","Prodotti"],"expense":["Personale","Affitto","Utenze","Attrezzatura"]}}'::jsonb,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'gym';

UPDATE "Category"
SET "presets" = COALESCE("presets", '{}'::jsonb) || '{"ledger":{"income":["Lavaggi","Stireria","Ritiri"],"expense":["Detersivi","Personale","Affitto","Utenze"]}}'::jsonb,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'laundry';

UPDATE "Category"
SET "presets" = COALESCE("presets", '{}'::jsonb) || '{"ledger":{"income":["Composizioni","Piante","Consegne"],"expense":["Fiori","Personale","Affitto","Utenze"]}}'::jsonb,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'florist';
