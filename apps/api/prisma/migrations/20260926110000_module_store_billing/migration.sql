-- In-app purchases (App Store / Google Play) next to Stripe, plus a detail page for every module.
CREATE TYPE "BillingSource" AS ENUM ('STRIPE', 'APPLE', 'GOOGLE', 'DEMO');
CREATE TYPE "StorePlatform" AS ENUM ('APPLE', 'GOOGLE');

ALTER TABLE "Tenant" ADD COLUMN "storeAccountToken" TEXT NOT NULL DEFAULT (gen_random_uuid())::text;
CREATE UNIQUE INDEX "Tenant_storeAccountToken_key" ON "Tenant"("storeAccountToken");

ALTER TABLE "ModuleDef" ADD COLUMN "details" TEXT NOT NULL DEFAULT '',
ADD COLUMN "features" TEXT[] DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "TenantModule" ADD COLUMN "billingSource" "BillingSource",
ADD COLUMN "licenseExpiresAt" TIMESTAMP(3);

UPDATE "TenantModule" SET "billingSource" = 'STRIPE' WHERE "licensed" = true AND "stripeSubscriptionId" IS NOT NULL;

CREATE TABLE "StorePurchase" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "platform" "StorePlatform" NOT NULL,
    "purchaseKey" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "autoRenewing" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorePurchase_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StorePurchase_platform_purchaseKey_key" ON "StorePurchase"("platform", "purchaseKey");
CREATE INDEX "StorePurchase_tenantId_moduleKey_idx" ON "StorePurchase"("tenantId", "moduleKey");
ALTER TABLE "StorePurchase" ADD CONSTRAINT "StorePurchase_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

UPDATE "ModuleDef" AS m SET "details" = v."details", "features" = v."features", "updatedAt" = CURRENT_TIMESTAMP
FROM (VALUES
  ('work_orders',
   'Ogni lavoro diventa un rapportino completo: apri l''intervento, scatti le foto, compili la checklist e fai firmare il cliente sul telefono. Alla chiusura il PDF è pronto da inviare.',
   ARRAY['Interventi e ticket con stato, data e tecnico assegnato', 'Foto, note e allegati direttamente dal cantiere', 'Firma del cliente e del tecnico sul telefono', 'PDF del rapportino pronto da condividere', 'Storico completo per cliente e impianto']),
  ('customers',
   'Tutti i tuoi clienti in un posto solo, con recapiti, indirizzi e lo storico di ogni lavoro fatto. Trovi chi ti serve in un attimo, anche fuori sede.',
   ARRAY['Anagrafica con telefono, email e indirizzo', 'Storico di interventi e impianti per cliente', 'Ricerca veloce e chiamata con un tocco', 'Campi personalizzati per le tue esigenze']),
  ('assets',
   'Una scheda per ogni impianto o attrezzatura: marca, modello, matricola e tutto quello che ci hai fatto sopra. Sai sempre cosa hai davanti prima di arrivare.',
   ARRAY['Schede con marca, modello e matricola', 'Storico degli interventi per impianto', 'Collegamento a cliente e sede', 'Campi personalizzati e foto']),
  ('calendar',
   'Scadenze, manutenzioni periodiche e appuntamenti in un calendario unico. Bitora ti ricorda cosa fare prima che scada, così non perdi lavori ricorrenti.',
   ARRAY['Calendario di appuntamenti e scadenze', 'Manutenzioni periodiche che si ripianificano da sole', 'Promemoria automatici prima della scadenza', 'Vista giornaliera per tutta la squadra']),
  ('spare_parts',
   'Il catalogo dei ricambi che usi, con codici, prezzi e modelli compatibili. Scansioni il codice a barre e trovi subito il pezzo giusto.',
   ARRAY['Catalogo ricambi con codice e prezzo', 'Scansione del codice a barre con la fotocamera', 'Modelli compatibili per ogni ricambio', 'Ricambi usati collegati all''intervento']),
  ('stock',
   'Sai cosa hai in magazzino e sul furgone, pezzo per pezzo. Le giacenze si aggiornano quando usi un ricambio in un intervento.',
   ARRAY['Giacenze per magazzino, furgone e punto vendita', 'Carichi, scarichi e spostamenti', 'Scarico automatico dai rapportini', 'Avvisi quando un articolo sta finendo']),
  ('checklists',
   'Controlli guidati passo passo, uguali per tutta la squadra. Perfetti per manutenzioni, sicurezza e procedure HACCP.',
   ARRAY['Modelli di checklist personalizzabili', 'Compilazione guidata anche offline', 'Checklist allegate a interventi e impianti', 'Registro dei controlli effettuati']),
  ('floor',
   'La piantina della tua sala, tavolo per tavolo. Vedi al volo quali tavoli sono liberi, occupati o in attesa del conto.',
   ARRAY['Piantina dei tavoli personalizzabile', 'Stato dei tavoli in tempo reale', 'Coperti e comande per tavolo', 'Apertura della comanda con un tocco']),
  ('orders',
   'Prendi le comande al tavolo e mandale direttamente a bar e cucina. Ogni reparto vede solo quello che deve preparare.',
   ARRAY['Comande dal telefono, al tavolo', 'Invio automatico a bar e cucina per reparto', 'Varianti e note per ogni piatto', 'Stato di preparazione e servizio']),
  ('menu',
   'Il tuo menu sempre aggiornato: piatti, categorie, prezzi e varianti. Le modifiche arrivano subito a tutti i dispositivi.',
   ARRAY['Piatti e categorie con prezzi', 'Varianti e supplementi', 'Disponibilità attivabile al volo', 'Reparto di preparazione per ogni piatto']),
  ('inventory',
   'Ingredienti e ricette collegati: ogni piatto venduto scarica il magazzino da solo. Sai sempre cosa ti manca prima che finisca.',
   ARRAY['Ingredienti con unità di misura e giacenze', 'Ricette collegate ai piatti del menu', 'Scarico automatico a ogni vendita', 'Scorte per magazzino e punto vendita']),
  ('suppliers',
   'I tuoi fornitori e gli ordini d''acquisto in un unico posto. Prepari l''ordine, lo invii e registri la merce quando arriva.',
   ARRAY['Anagrafica fornitori con recapiti', 'Ordini d''acquisto con righe e prezzi', 'Ricezione merce che carica il magazzino', 'Storico degli ordini per fornitore']),
  ('shifts',
   'Organizza i turni del personale in pochi tocchi. Ognuno vede i propri turni sul telefono, senza gruppi e fogli sparsi.',
   ARRAY['Pianificazione settimanale dei turni', 'Ruoli e orari per ogni persona', 'Turni visibili a ciascun collaboratore', 'Conferma e storico dei turni svolti']),
  ('accounting',
   'Tieni la prima nota senza fogli di calcolo: registri entrate e uscite, colleghi clienti e fornitori e vedi il saldo del mese.',
   ARRAY['Entrate e uscite con categoria e IVA', 'Collegamento a clienti, fornitori e interventi', 'Saldo del mese e importi da incassare', 'Metodi di pagamento e movimenti da saldare'])
) AS v("key", "details", "features")
WHERE m."key" = v."key";
