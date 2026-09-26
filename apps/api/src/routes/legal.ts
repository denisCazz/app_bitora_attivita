import { LEGAL_VERSION } from "@rapportini/shared";
import type { FastifyInstance } from "fastify";
import { env } from "../env";

function escape(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

function field(value: string | undefined, missing: string) {
  return value?.trim() ? escape(value.trim()) : `<mark>[da completare: ${missing}]</mark>`;
}

const legal = env.legal;
const company = () => field(legal.company, "ragione sociale");
const contact = () => field(legal.email, "email privacy");
const updated = new Date(`${LEGAL_VERSION}T00:00:00Z`).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });

function speechProvider() {
  switch (env.speech.provider) {
    case "azure":
      return "Microsoft Ireland Operations Ltd (Azure Speech) – sintesi vocale delle risposte, UE/USA";
    case "elevenlabs":
      return "ElevenLabs Inc. – sintesi vocale delle risposte, USA";
    case "openai":
      return null;
    default:
      return "Microsoft Corporation (servizio vocale Edge) – sintesi vocale delle risposte, USA";
  }
}

function processors() {
  return [
    `${field(legal.hosting, "fornitore hosting e database")} – server applicativo e database`,
    env.s3 ? `${escape(env.s3.endpoint ? new URL(env.s3.endpoint).hostname : "Amazon Web Services")} – archiviazione di foto e allegati` : null,
    "Stripe Payments Europe Ltd (Irlanda) – pagamenti con carta di moduli e utenti aggiuntivi",
    "Apple Distribution International Ltd e Google Ireland Ltd – acquisti in-app e invio delle notifiche push",
    "650 Industries Inc. (Expo, USA) – instradamento delle notifiche push",
    env.openai.apiKey ? "OpenAI Ireland Ltd / OpenAI L.L.C. (USA) – assistente IA: comprensione dei testi, trascrizione della voce" : null,
    env.openai.apiKey ? speechProvider() : null,
  ].filter((item): item is string => Boolean(item));
}

function page(title: string, body: string) {
  return `<!doctype html><html lang="it"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Bitora</title>
<style>
body{margin:0;font:16px/1.6 -apple-system,system-ui,sans-serif;background:#0E0F12;color:#E9EAEE}
main{max-width:760px;margin:0 auto;padding:32px 20px 64px}
h1{font-weight:650;line-height:1.2}h2{margin-top:2em;font-size:1.15em}
a{color:#F5B971}mark{background:#5b2a12;color:#FFD9B8;padding:0 4px;border-radius:4px}
nav{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:24px;opacity:.85}
li{margin:.3em 0}small{opacity:.65}
</style>
<main><nav><a href="/legal/privacy">Privacy</a><a href="/legal/terms">Termini</a><a href="/legal">Note legali</a><a href="/account/delete">Elimina account</a></nav>
<h1>${title}</h1><small>Versione ${LEGAL_VERSION} · aggiornata il ${updated}</small>
${body}
</main></html>`;
}

function imprint() {
  return `<ul>
<li>Titolare del servizio: ${company()}</li>
<li>Sede legale: ${field(legal.address, "indirizzo sede legale")}</li>
<li>Partita IVA: ${field(legal.vatNumber, "partita IVA")}</li>
<li>Iscrizione REA: ${field(legal.rea, "numero REA")}</li>
<li>PEC: ${field(legal.pec, "PEC")}</li>
<li>Contatto privacy e punto di contatto unico (Reg. UE 2022/2065, artt. 11-12): ${contact()}</li>
${legal.dpoEmail ? `<li>Responsabile della protezione dei dati (DPO): ${escape(legal.dpoEmail)}</li>` : ""}
</ul>`;
}

function privacyPage() {
  return page(
    "Informativa privacy",
    `<p>Questa informativa spiega, ai sensi degli artt. 13 e 14 del Regolamento (UE) 2016/679 (GDPR), come trattiamo i dati personali nell'app Bitora e nei servizi collegati.</p>

<h2>1. Titolare del trattamento</h2>
${imprint()}

<h2>2. Due ruoli diversi</h2>
<p><b>Dati del tuo account</b> (chi usa l'app): li trattiamo noi, come titolare.</p>
<p><b>Dati che il tuo negozio inserisce</b> sui propri clienti, impianti, interventi, ordini e turni: il titolare è il negozio. Noi li trattiamo come responsabile (art. 28 GDPR) solo per erogare il servizio, secondo l'accordo nei <a href="/legal/terms#dpa">Termini</a>. Per esercitare i diritti su questi dati rivolgiti al negozio.</p>

<h2>3. Quali dati trattiamo</h2>
<ul>
<li>Account: nome, email, password (salvata solo in forma cifrata non reversibile), ruolo nei negozi, date di accettazione dei termini e del consenso all'assistente IA.</li>
<li>Contenuti che inserisci: clienti, schede, checklist, firme, foto e allegati, ordini, magazzino, turni, movimenti contabili.</li>
<li>Assistente IA (solo se lo attivi): testi e registrazioni vocali che invii all'assistente.</li>
<li>Dispositivo: token per le notifiche push, piattaforma (iOS/Android/web), dati tecnici di log (indirizzo IP, data e ora delle richieste) per sicurezza.</li>
<li>Pagamenti: gestiti da Stripe, Apple o Google. Non vediamo né conserviamo i dati della carta.</li>
<li>Posizione: usata solo sul dispositivo, a app aperta, per mostrarti la mappa degli interventi. Non la salviamo sui nostri server.</li>
<li>Fotocamera, microfono e foto: solo quando li usi per allegare foto, leggere codici o parlare con l'assistente.</li>
</ul>

<h2>4. Perché e su quale base giuridica</h2>
<ul>
<li>Fornirti il servizio, gestire account, abbonamenti e assistenza: esecuzione del contratto (art. 6.1.b).</li>
<li>Fatturazione e obblighi fiscali: obbligo di legge (art. 6.1.c).</li>
<li>Sicurezza, prevenzione di abusi e frodi: legittimo interesse (art. 6.1.f).</li>
<li>Assistente IA: tuo consenso (art. 6.1.a), che puoi revocare in ogni momento dal Profilo.</li>
<li>Notifiche push: le ricevi solo se le autorizzi dalle impostazioni del telefono.</li>
</ul>
<p>Non vendiamo i dati, non li usiamo per pubblicità e non facciamo profilazione. Non prendiamo decisioni basate unicamente su trattamenti automatizzati che producano effetti giuridici (art. 22): l'assistente propone le azioni e le esegue solo dopo la tua conferma.</p>

<h2>5. A chi li affidiamo</h2>
<p>Usiamo questi fornitori, nominati responsabili del trattamento:</p>
<ul>${processors()
      .map((item) => `<li>${item}</li>`)
      .join("")}</ul>
<p>Alcuni si trovano negli Stati Uniti. Il trasferimento avviene sulla base dell'EU-US Data Privacy Framework (decisione di adeguatezza del 10 luglio 2023) o delle Clausole contrattuali standard della Commissione europea (art. 46 GDPR). OpenAI non usa i dati ricevuti tramite API per addestrare i propri modelli, secondo le sue condizioni commerciali.</p>

<h2>6. Per quanto tempo</h2>
<ul>
<li>Account e contenuti: finché l'account è attivo. Quando elimini l'account li cancelliamo subito. Le copie di backup vengono sovrascritte entro 30 giorni.</li>
<li>Dati di fatturazione: 10 anni, come richiesto dall'art. 2220 del Codice civile. Li conservano Stripe, Apple o Google.</li>
<li>Log tecnici di sicurezza: al massimo 12 mesi.</li>
<li>Conversazioni con l'assistente: non le archiviamo sui nostri server oltre il tempo della risposta.</li>
</ul>

<h2>7. I tuoi diritti</h2>
<p>Puoi chiedere accesso, rettifica, cancellazione, limitazione, portabilità, e opporti al trattamento (artt. 15-22 GDPR). Puoi revocare il consenso in ogni momento, senza effetti sui trattamenti già fatti.</p>
<p>Nell'app, da <b>Altro › Profilo</b>, puoi da solo modificare i dati, scaricarli in formato JSON, revocare il consenso all'assistente IA ed eliminare l'account. Puoi farlo anche <a href="/account/delete">da questa pagina web</a> o scrivendo a ${contact()}. Rispondiamo entro un mese.</p>
<p>Se ritieni che il trattamento violi il GDPR puoi proporre reclamo al Garante per la protezione dei dati personali (<a href="https://www.garanteprivacy.it">www.garanteprivacy.it</a>).</p>

<h2>8. Minori</h2>
<p>Bitora è riservata a professionisti e imprese maggiorenni. Non raccogliamo consapevolmente dati di minori di 18 anni.</p>

<h2>9. Cookie e archiviazione locale</h2>
<p>L'app e la versione web salvano sul dispositivo solo i dati tecnici necessari a tenerti connesso e a lavorare offline. Non usiamo cookie di profilazione, strumenti di analisi o pubblicità, quindi non serve un banner cookie (art. 122 Codice privacy).</p>

<h2>10. Sicurezza</h2>
<p>Connessioni cifrate (HTTPS), password cifrate, token di accesso a scadenza breve, separazione dei dati tra negozi, accesso ai dati limitato ai ruoli autorizzati.</p>

<h2>11. Modifiche</h2>
<p>Se questa informativa cambia in modo sostanziale te lo chiediamo di nuovo nell'app. La versione in vigore è sempre su questa pagina.</p>`,
  );
}

function termsPage() {
  return page(
    "Termini di servizio",
    `<p>Questi termini regolano l'uso di Bitora (app e servizi web) fornito da ${company()} («noi»). Registrandoti li accetti.</p>

<h2>1. A chi è rivolto</h2>
<p>Bitora è un servizio per <b>professionisti e imprese</b> che lo usano per la propria attività. Registrandoti dichiari di avere almeno 18 anni e di agire per scopi professionali: per questo non si applicano le norme a tutela dei consumatori del D.Lgs. 206/2005.</p>

<h2>2. Account</h2>
<p>Sei responsabile delle credenziali e di quello che succede con il tuo account. Chi crea un negozio ne è il titolare e decide chi invitare e con quali permessi. Avvisaci subito se sospetti un accesso non autorizzato.</p>

<h2>3. Piano gratuito, moduli e pagamenti</h2>
<ul>
<li>Il piano base è gratuito e include fino a 3 utenti. Moduli e utenti aggiuntivi sono a pagamento, al prezzo mostrato nell'app prima dell'acquisto (IVA secondo la normativa applicabile).</li>
<li>Gli abbonamenti sono mensili e si rinnovano in automatico finché non li disdici. Puoi disdire in ogni momento: l'accesso resta fino alla fine del periodo già pagato e non ci sono rimborsi per i periodi parziali, salvo quanto previsto dalla legge.</li>
<li>Le prove gratuite, se previste, durano i giorni indicati e si possono usare una sola volta per modulo.</li>
<li>Gli acquisti fatti tramite App Store o Google Play seguono anche le condizioni di Apple o Google, e si gestiscono dalle impostazioni del tuo account su quelle piattaforme.</li>
<li>Possiamo cambiare i prezzi con almeno 30 giorni di preavviso. Il nuovo prezzo vale dal rinnovo successivo e puoi disdire prima.</li>
</ul>

<h2>4. I tuoi contenuti</h2>
<p>I dati che inserisci restano tuoi. Ci concedi solo il diritto di conservarli ed elaborarli per fornirti il servizio. Puoi esportarli in ogni momento dal Profilo.</p>

<h2>5. Uso corretto</h2>
<p>Non puoi usare Bitora per attività illecite, per caricare contenuti che violano diritti di terzi, per aggirare limiti tecnici o di pagamento, o per compromettere la sicurezza del servizio. Devi avere una base giuridica valida per i dati dei tuoi clienti che inserisci.</p>

<h2>6. Assistente IA</h2>
<p>L'assistente è un sistema di intelligenza artificiale e le sue risposte sono generate automaticamente: possono essere incomplete o sbagliate. Prima di modificare dati ti chiede sempre conferma. Controlla le proposte prima di confermarle, soprattutto importi, date e dati dei clienti.</p>

<h2 id="art7">7. Disponibilità del servizio</h2>
<p>Facciamo il possibile perché Bitora sia sempre disponibile, ma possono esserci interruzioni per manutenzione, aggiornamenti o cause esterne. Possiamo modificare o migliorare le funzioni, senza ridurre in modo sostanziale quelle già pagate durante il periodo in corso.</p>

<h2 id="art8">8. Limitazione di responsabilità</h2>
<p>Nei limiti consentiti dall'art. 1229 del Codice civile, non rispondiamo di danni indiretti, perdita di profitto o di dati dovuti a uso non conforme, e la nostra responsabilità complessiva è limitata agli importi pagati negli ultimi 12 mesi. Resta ferma la responsabilità per dolo o colpa grave.</p>

<h2 id="art9">9. Sospensione e recesso</h2>
<p>Puoi eliminare l'account quando vuoi dal Profilo. Possiamo sospendere o chiudere l'account in caso di violazione grave di questi termini o di mancato pagamento, con preavviso quando possibile. Alla chiusura cancelliamo i dati come descritto nell'<a href="/legal/privacy">Informativa privacy</a>; prima puoi esportarli.</p>

<h2 id="dpa">10. Accordo sul trattamento dei dati (art. 28 GDPR)</h2>
<p>Per i dati personali che il negozio inserisce su clienti, dipendenti e fornitori, il negozio è <b>titolare</b> e ci nomina <b>responsabile del trattamento</b>. In particolare:</p>
<ul>
<li>trattiamo i dati solo per fornire Bitora e secondo le istruzioni del negozio, date tramite le funzioni dell'app;</li>
<li>chi accede ai dati per nostro conto è vincolato alla riservatezza;</li>
<li>adottiamo misure di sicurezza adeguate (art. 32): cifratura in transito, controllo degli accessi per ruolo, separazione dei dati tra negozi;</li>
<li>il negozio ci autorizza in via generale a usare i sub-responsabili elencati nell'<a href="/legal/privacy">Informativa privacy</a>, con gli stessi obblighi. Comunichiamo le modifiche aggiornando quell'elenco e il negozio può opporsi recedendo;</li>
<li>aiutiamo il negozio a rispondere alle richieste degli interessati e agli obblighi degli artt. 32-36;</li>
<li>comunichiamo al negozio le violazioni dei dati personali senza ingiustificato ritardo, entro 48 ore da quando ne veniamo a conoscenza;</li>
<li>a fine servizio il negozio può esportare i dati; dopo l'eliminazione li cancelliamo, salvo obblighi di legge;</li>
<li>mettiamo a disposizione le informazioni necessarie a dimostrare il rispetto di questi obblighi e consentiamo verifiche con preavviso ragionevole.</li>
</ul>

<h2>11. Modifiche ai termini</h2>
<p>Se cambiamo questi termini in modo sostanziale te lo chiediamo di nuovo nell'app. Se non li accetti puoi eliminare l'account.</p>

<h2 id="art12">12. Legge applicabile e foro</h2>
<p>Si applica la legge italiana. Per ogni controversia è competente in via esclusiva il Foro di ${field(legal.court, "città del foro competente")}.</p>

<h2>13. Approvazione specifica</h2>
<p>Ai sensi degli artt. 1341 e 1342 del Codice civile, con una conferma separata al momento della registrazione approvi specificamente: art. 3 (rinnovo automatico e rimborsi), art. 7 (modifica del servizio), art. 8 (limitazione di responsabilità), art. 9 (sospensione e recesso), art. 12 (foro competente).</p>`,
  );
}

function imprintPage() {
  return page(
    "Note legali",
    `${imprint()}
<p>Documenti: <a href="/legal/privacy">Informativa privacy</a> · <a href="/legal/terms">Termini di servizio</a> · <a href="/account/delete">Eliminazione dell'account</a></p>`,
  );
}

export async function legalRoutes(app: FastifyInstance) {
  app.get("/legal", async (_request, reply) => reply.type("text/html; charset=utf-8").send(imprintPage()));
  app.get("/legal/privacy", async (_request, reply) => reply.type("text/html; charset=utf-8").send(privacyPage()));
  app.get("/legal/terms", async (_request, reply) => reply.type("text/html; charset=utf-8").send(termsPage()));
  app.get("/legal/version", async () => ({ version: LEGAL_VERSION }));
}
