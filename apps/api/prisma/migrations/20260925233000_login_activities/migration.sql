-- Photos for the trades already in the catalog, and the ones the login carousel should show.
UPDATE "Category" SET "image" = 'asset:nails' WHERE "key" = 'nails';
UPDATE "Category" SET "image" = 'asset:hair' WHERE "key" = 'hair';
UPDATE "Category" SET "image" = 'asset:spa' WHERE "key" = 'spa';
UPDATE "Category" SET "image" = 'asset:spa' WHERE "key" = 'wellness' AND "image" IS NULL;
UPDATE "Category" SET "image" = 'asset:restaurant' WHERE "key" = 'restaurant';

INSERT INTO "Category" ("id", "key", "parentId", "label", "description", "icon", "accent", "image", "terminology", "presets", "sortOrder", "updatedAt") VALUES
  ('cat_plumbing', 'plumbing', 'cat_field_service', 'Idraulici',
   'Impianti idraulici, perdite e scaldabagni.', 'water-outline', '#0E7490', 'asset:plumber',
   '{}',
   '{"assetTypes":["Impianto idraulico","Scaldabagno","Autoclave"],"sample":{"asset":{"name":"Impianto bagno","type":"Impianto idraulico"},"workOrder":"Perdita sotto il lavello"}}',
   3, CURRENT_TIMESTAMP),
  ('cat_electrical', 'electrical', 'cat_field_service', 'Elettricisti',
   'Quadri, impianti e guasti elettrici.', 'flash-outline', '#CA8A04', 'asset:electrician',
   '{}',
   '{"assetTypes":["Quadro elettrico","Impianto","Punto luce"],"sample":{"asset":{"name":"Quadro appartamento","type":"Quadro elettrico"},"workOrder":"Guasto quadro"}}',
   4, CURRENT_TIMESTAMP),
  ('cat_solar', 'solar', 'cat_field_service', 'Fotovoltaico',
   'Pannelli, inverter e manutenzioni.', 'sunny-outline', '#F59E0B', 'asset:solar',
   '{"asset":"Impianto","assets":"Impianti"}',
   '{"assetTypes":["Impianto fotovoltaico","Inverter"],"sample":{"asset":{"name":"Impianto tetto","type":"Impianto fotovoltaico","brand":"SolarEdge"},"workOrder":"Controllo inverter"}}',
   5, CURRENT_TIMESTAMP),
  ('cat_carpentry', 'carpentry', 'cat_field_service', 'Falegnami',
   'Mobili, infissi e riparazioni in legno.', 'hammer-outline', '#92400E', 'asset:carpenter',
   '{"asset":"Lavoro","assets":"Lavori"}',
   '{"assetTypes":["Mobile","Infisso","Porta"],"sample":{"asset":{"name":"Cucina in rovere","type":"Mobile"},"workOrder":"Regolazione ante"}}',
   6, CURRENT_TIMESTAMP),
  ('cat_mechanic', 'mechanic', 'cat_field_service', 'Officine',
   'Tagliandi, guasti e auto in officina.', 'car-outline', '#334155', 'asset:mechanic',
   '{"asset":"Veicolo","assets":"Veicoli","vehicle":"Auto"}',
   '{"assetTypes":["Auto","Furgone","Moto"],"sample":{"asset":{"name":"Panda del cliente","type":"Auto","brand":"Fiat","model":"Panda"},"workOrder":"Tagliando"}}',
   7, CURRENT_TIMESTAMP),
  ('cat_garden', 'garden', 'cat_field_service', 'Giardinieri',
   'Potature, impianti di irrigazione e giardini.', 'leaf-outline', '#3F6212', 'asset:garden',
   '{"asset":"Giardino","assets":"Giardini"}',
   '{"assetTypes":["Giardino","Impianto irrigazione","Siepe"],"sample":{"asset":{"name":"Giardino Rossi","type":"Giardino"},"workOrder":"Potatura siepe"}}',
   8, CURRENT_TIMESTAMP),
  ('cat_gelato', 'gelato', 'cat_hospitality', 'Gelaterie',
   'Banco, gusti e vetrina.', 'ice-cream-outline', '#E11D48', 'asset:gelato',
   '{}',
   $gelato${
     "stations": [{"key":"COUNTER","label":"Banco"}],
     "sample": {
       "stockLocations": [{"name":"Banco","kind":"POINT"}],
       "tables": [{"name":"Banco","posX":0.45,"posY":0.4,"seats":2}],
       "assets": [{"name":"Vetrina","type":"Vetrina"}],
       "ingredients": [{"name":"Latte","unit":"l","sku":"LAT","stock":[{"location":"Banco","quantity":8}]}],
       "menu": [
         {"name":"Crema","category":"Gelato","station":"COUNTER","price":2.5,"recipe":[{"ingredient":"Latte","quantity":0.1}]},
         {"name":"Pistacchio","category":"Gelato","station":"COUNTER","price":3}
       ],
       "order": {"table":"Banco","covers":1,"lines":[{"item":"Crema","quantity":2,"status":"SENT"}]},
       "workOrder": "Manutenzione vetrina"
     }
   }$gelato$::jsonb,
   2, CURRENT_TIMESTAMP),
  ('cat_bakery', 'bakery', 'cat_hospitality', 'Pasticcerie',
   'Forno, banco e produzione del giorno.', 'nutrition-outline', '#C2410C', 'asset:bakery',
   '{}',
   $bakery${
     "stations": [{"key":"OVEN","label":"Forno"},{"key":"COUNTER","label":"Banco"}],
     "sample": {
       "stockLocations": [{"name":"Laboratorio","kind":"POINT"},{"name":"Banco","kind":"POINT"}],
       "tables": [{"name":"Banco","posX":0.5,"posY":0.45,"seats":2}],
       "assets": [{"name":"Forno","type":"Forno"}],
       "ingredients": [{"name":"Farina","unit":"kg","sku":"FAR","stock":[{"location":"Laboratorio","quantity":25}]}],
       "menu": [
         {"name":"Cornetto","category":"Colazione","station":"COUNTER","price":1.4,"recipe":[{"ingredient":"Farina","quantity":0.05}]},
         {"name":"Torta della nonna","category":"Pasticceria","station":"OVEN","price":18}
       ],
       "order": {"table":"Banco","covers":1,"lines":[{"item":"Cornetto","quantity":2,"status":"SENT"}]},
       "workOrder": "Controllo forno"
     }
   }$bakery$::jsonb,
   3, CURRENT_TIMESTAMP),
  ('cat_barber', 'barber', 'cat_wellness', 'Barbieri',
   'Taglio, barba e poltrona.', 'man-outline', '#7C2D12', 'asset:barber',
   '{"asset":"Poltrona","assets":"Poltrone"}',
   '{"assetTypes":["Poltrona","Lavaggio"],"sample":{"assets":[{"name":"Poltrona 1","type":"Poltrona"}],"menu":[{"name":"Taglio","category":"Servizi","station":"CHAIR","price":18},{"name":"Barba","category":"Servizi","station":"CHAIR","price":12}],"workOrder":"Taglio Rossi"}}',
   3, CURRENT_TIMESTAMP),
  ('cat_gym', 'gym', 'cat_wellness', 'Palestre',
   'Ingressi, schede e sala attrezzi.', 'barbell-outline', '#EA580C', 'asset:gym',
   '{"workOrder":"Scheda","workOrders":"Schede","asset":"Attrezzo","assets":"Attrezzi"}',
   '{"assetTypes":["Sala","Attrezzo"],"sample":{"assets":[{"name":"Sala pesi","type":"Sala"}],"menu":[{"name":"Ingresso","category":"Abbonamenti","station":"CHAIR","price":40},{"name":"Scheda personalizzata","category":"Servizi","station":"CHAIR","price":30}],"workOrder":"Scheda Bianchi"}}',
   4, CURRENT_TIMESTAMP),
  ('cat_laundry', 'laundry', 'cat_wellness', 'Lavanderie',
   'Capi, ritiri e consegne.', 'shirt-outline', '#0369A1', 'asset:laundry',
   '{"workOrder":"Capo","workOrders":"Capi","asset":"Macchina","assets":"Macchine"}',
   '{"assetTypes":["Lavatrice","Asciugatrice","Stiratrice"],"sample":{"assets":[{"name":"Lavatrice 1","type":"Lavatrice"}],"menu":[{"name":"Camicia","category":"Stireria","station":"CHAIR","price":3},{"name":"Completo","category":"Lavaggio","station":"CHAIR","price":12}],"workOrder":"Camicia Bianchi"}}',
   5, CURRENT_TIMESTAMP),
  ('cat_florist', 'florist', 'cat_wellness', 'Fiorai',
   'Bouquet, piante e consegne.', 'rose-outline', '#BE185D', 'asset:florist',
   '{"workOrder":"Composizione","workOrders":"Composizioni","asset":"Banco","assets":"Banchi"}',
   '{"assetTypes":["Banco","Cella"],"sample":{"assets":[{"name":"Banco fiori","type":"Banco"}],"menu":[{"name":"Bouquet","category":"Fiori","station":"CHAIR","price":25},{"name":"Pianta","category":"Piante","station":"CHAIR","price":18}],"workOrder":"Bouquet Bianchi"}}',
   6, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
