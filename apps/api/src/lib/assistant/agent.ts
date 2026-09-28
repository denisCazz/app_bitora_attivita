import { DEFAULT_SLOT_MINUTES, slotMinutes, type Manifest } from "@rapportini/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { availableActions, pathParams, toolDefinition, type Action } from "./actions";
import { complete, type ChatMessage, type ToolCall } from "./openai";
import { preflight } from "./preflight";

const MAX_STEPS = 12;
const MAX_WRITES = 12;
const MAX_HISTORY = 40;
const MAX_RESULT_CHARS = 12_000;
const HIDDEN_KEYS = new Set(["tenantId", "createdAt", "updatedAt", "signatureData", "technicianSignature", "passwordHash", "appleRefreshToken"]);

export interface PendingAction {
  id: string;
  title: string;
  summary: string;
}

export interface DoneAction {
  title: string;
  summary: string;
  ok: boolean;
  error?: string;
}

export interface AssistantResult {
  messages: ChatMessage[];
  reply: string | null;
  pending: PendingAction[];
  done: DoneAction[];
}

function parseArgs(call: ToolCall): Record<string, unknown> {
  try {
    const value = JSON.parse(call.function.arguments || "{}") as unknown;
    return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function compact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(compact);
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([key, item]) => !HIDDEN_KEYS.has(key) && item !== null && item !== undefined && !(Array.isArray(item) && item.length === 0))
      .map(([key, item]) => [key, compact(item)]);
    return Object.fromEntries(entries);
  }
  return value;
}

function serialize(value: unknown): string {
  const text = JSON.stringify(compact(value));
  return text.length > MAX_RESULT_CHARS ? `${text.slice(0, MAX_RESULT_CHARS)}… [troncato: restringi la ricerca]` : text;
}

async function execute(app: FastifyInstance, request: FastifyRequest, action: Action, args: Record<string, unknown>) {
  let url = action.path;
  for (const param of pathParams(action)) {
    const value = args[param];
    if (typeof value !== "string" || !value) return { ok: false, error: `Parametro mancante: ${param}` };
    url = url.replace(`:${param}`, encodeURIComponent(value));
  }
  const query = args.query && typeof args.query === "object" ? (args.query as Record<string, unknown>) : {};
  const search = new URLSearchParams(
    Object.entries(query)
      .filter(([, value]) => value !== undefined && value !== null && value !== "")
      .map(([key, value]) => [key, String(value)]),
  ).toString();
  const response = await app.inject({
    method: action.method,
    url: search ? `${url}?${search}` : url,
    headers: { authorization: request.headers.authorization ?? "" },
    ...(action.method === "GET" || action.method === "DELETE" ? {} : { payload: (args.body ?? {}) as object }),
  });
  let data: unknown = null;
  try {
    data = response.body ? JSON.parse(response.body) : null;
  } catch {
    data = response.body;
  }
  if (response.statusCode >= 400) {
    const error = (data as { error?: string } | null)?.error ?? `Errore ${response.statusCode}`;
    return { ok: false, error };
  }
  return { ok: true, data };
}

function openCalls(messages: ChatMessage[]): ToolCall[] {
  const last = messages.at(-1);
  return last?.role === "assistant" && last.tool_calls?.length ? last.tool_calls : [];
}

function recent(messages: ChatMessage[]): ChatMessage[] {
  if (messages.length <= MAX_HISTORY) return messages;
  const slice = messages.slice(-MAX_HISTORY);
  const start = slice.findIndex((message) => message.role === "user");
  return start > 0 ? slice.slice(start) : slice;
}

function romeNow() {
  const now = new Date();
  const day = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(now);
  const offset = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Rome", timeZoneName: "longOffset" }).formatToParts(now).find((part) => part.type === "timeZoneName")?.value.replace("GMT", "") || "+00:00";
  return { day, offset };
}

function systemPrompt(manifest: Manifest, actions: Action[]): string {
  const { day, offset } = romeNow();
  const active = manifest.modules.filter((module) => module.status === "active" || module.status === "trial").map((module) => module.label);
  return [
    `Sei l'assistente operativo dell'app Bitora per "${manifest.tenant.name}" (${manifest.tenant.category.path.join(" › ") || manifest.tenant.category.label}).`,
    `Parli con ${manifest.user.name}, ruolo "${manifest.role.name}". Rispondi sempre in italiano, in modo breve e pratico, come parleresti a voce.`,
    "Scrivi solo testo semplice: niente markdown, asterischi, titoli o elenchi puntati, perché le risposte vengono anche lette ad alta voce. Per più elementi usa frasi brevi separate da virgole.",
    `Adesso è ${day} (ora di Roma, UTC${offset}). Le date che invii alle azioni sono ISO 8601 con fuso ${offset}, es. 2026-01-31T09:00:00${offset}.`,
    `Moduli attivi: ${active.join(", ") || "nessuno"}.`,
    `Parole del negozio: ${JSON.stringify(manifest.tenant.terminology)}.`,
    `Tipi di impianto: ${JSON.stringify(manifest.tenant.assetTypes)}. Reparti (station): ${JSON.stringify(manifest.tenant.vocab.stations)}. Tipi di appuntamento/scadenza (kind) con durata predefinita in minuti: ${JSON.stringify(manifest.tenant.vocab.scheduleKinds.map((item) => ({ key: item.key, label: item.label, minutes: slotMinutes(manifest.tenant.vocab.scheduleKinds, item.key) })))}. Interventi senza durata indicata: ${DEFAULT_SLOT_MINUTES} minuti.`,
    manifest.customFields.length ? `Campi personalizzati (customFields per chiave): ${JSON.stringify(manifest.customFields.map(({ entity, key, label, type, required, options }) => ({ entity, key, label, type, required, options })))}.` : "",
    "",
    "Regole:",
    "- Agisci solo con le azioni disponibili: sono le stesse cose che l'utente può fare dall'app, con i suoi permessi. Se una cosa non è tra le azioni, dillo e non inventare.",
    "- Prima di creare qualcosa cerca se esiste già (cliente, impianto, tavolo, voce di menu). Non inventare mai ID: usa quelli restituiti dalle ricerche.",
    "- Voci di comanda: aggiungi solo voci presenti nel menu (menuItemId). Se una voce non c'è o non è disponibile, fermati per quella voce, dillo e proponi le voci simili; non aggiungerla come testo libero a meno che l'utente lo chieda esplicitamente.",
    "- Le voci inviate partono subito verso il loro reparto (cucina, banco o altro). Per una comanda con più voci usa una sola send_order con tutte le righe in lines.",
    "- Se una richiesta è ambigua (due clienti con lo stesso nome, più piatti simili) chiedi quale.",
    "- Non inventare mai dati: nomi, telefoni, email, indirizzi, date, orari e durate arrivano solo dall'utente o dalle ricerche.",
    "- Prima di creare qualcosa raccogli tutti i dati che chiederebbe il modulo dell'app (li trovi nella descrizione di ogni azione). Chiedi quelli mancanti tutti insieme, in un'unica domanda breve. Se l'utente dice che un dato non c'è o di saltarlo, mettilo in skipped.",
    "- Solo per le comande puoi usare valori sensati senza chiedere (es. 1 coperto) e dirlo nel riepilogo.",
    "- Se per fare una cosa serve prima un'altra (es. appuntamento per un cliente che non esiste), chiedi subito anche i dati della seconda, così l'utente risponde una volta sola.",
    "- Quando hai tutto, chiama direttamente le azioni di modifica: l'app mostra all'utente una scheda di conferma, quindi non chiedere \"confermi?\" a parole. Non scrivere mai \"procedo\" senza chiamare le azioni nello stesso messaggio.",
    "- Nel summary della prima modifica descrivi TUTTO quello che farai in questo turno (es. \"Apro la comanda al tavolo 2 e aggiungo 1 Coca-Cola\"): dopo la conferma le modifiche successive dello stesso turno partono senza chiedere di nuovo.",
    "- Appuntamenti e interventi occupano solo il loro slot: da inizio a inizio + durata (start/end in get_agenda). Un appuntamento alle 20:00 NON occupa la giornata: prima e dopo lo slot l'orario è libero. Non inventare mai orari di fine.",
    "- Per un appuntamento servono: per chi o cosa (titolo, di solito col nome del cliente), tipo, giorno e ora, durata e, se ci sono, postazione o attrezzatura. La durata la decide l'utente: se non la dice proponigli quella predefinita del tipo nella stessa domanda.",
    "- Prima di fissare un appuntamento o un intervento guarda con get_agenda la giornata richiesta e verifica che lo slot intero (inizio + durata) sia libero. Se si sovrappone avvisa, di' con cosa e proponi l'orario libero più vicino. Usa overlapOk true solo se l'utente vuole comunque quell'orario.",
    "- Il server ricontrolla dati e slot: se un'azione torna con un errore, non riprovare a caso, chiedi all'utente quello che manca.",
    "- Se un'azione restituisce un errore spiegalo all'utente con parole semplici e proponi come rimediare.",
    "- Alla fine riassumi in una o due frasi cosa hai fatto.",
    actions.length ? "" : "Questo utente non ha azioni disponibili: puoi solo rispondere a domande generali sull'app.",
  ].join("\n");
}

export async function runAssistant(
  app: FastifyInstance,
  request: FastifyRequest,
  manifest: Manifest,
  input: { messages: ChatMessage[]; text?: string; decision?: "approve" | "reject" },
): Promise<AssistantResult> {
  const actions = availableActions(manifest);
  const byName = new Map(actions.map((action) => [action.name, action]));
  const tools = actions.map((action) => toolDefinition(action, manifest));
  const system = systemPrompt(manifest, actions);
  const messages = [...input.messages];
  const done: DoneAction[] = [];
  let approved = false;
  let writes = 0;

  async function run(call: ToolCall): Promise<string> {
    const action = byName.get(call.function.name);
    if (!action) return serialize({ ok: false, error: "Azione non disponibile per questo utente" });
    const args = parseArgs(call);
    if (action.write && writes >= MAX_WRITES) return serialize({ ok: false, error: "Troppe modifiche in un solo turno" });
    const check = await preflight(request, manifest, action, args);
    if (!check.ok) return serialize({ ok: false, error: check.error });
    const result = await execute(app, request, action, args);
    if (action.write) {
      writes += 1;
      done.push({ title: action.title, summary: typeof args.summary === "string" ? args.summary : action.title, ok: result.ok, ...(result.ok ? {} : { error: result.error }) });
    }
    return serialize(result);
  }

  const open = openCalls(messages);
  if (open.length) {
    approved = input.decision === "approve";
    for (const call of open) {
      const action = byName.get(call.function.name);
      const content = action?.write && !approved ? serialize({ ok: false, error: "L'utente ha annullato questa modifica" }) : await run(call);
      messages.push({ role: "tool", tool_call_id: call.id, content });
    }
  }
  if (input.text?.trim()) messages.push({ role: "user", content: input.text.trim() });

  for (let step = 0; step < MAX_STEPS; step += 1) {
    const reply = await complete(system, recent(messages), tools);
    messages.push(reply);
    const calls = reply.tool_calls ?? [];
    if (!calls.length) return { messages, reply: reply.content, pending: [], done };
    const writing = calls.filter((call) => byName.get(call.function.name)?.write);
    if (writing.length && !approved) {
      const checks = await Promise.all(writing.map(async (call) => ({ call, check: await preflight(request, manifest, byName.get(call.function.name)!, parseArgs(call)) })));
      if (checks.some(({ check }) => !check.ok)) {
        for (const call of calls) {
          const entry = checks.find((item) => item.call.id === call.id);
          const content = !entry
            ? await run(call)
            : serialize({ ok: false, error: entry.check.ok ? "Non eseguita: prima sistema le altre modifiche di questo turno" : entry.check.error });
          messages.push({ role: "tool", tool_call_id: call.id, content });
        }
        continue;
      }
      const pending = checks.map(({ call, check }) => {
        const action = byName.get(call.function.name)!;
        const summary = parseArgs(call).summary;
        const text = typeof summary === "string" && summary.trim() ? summary.trim() : action.title;
        return { id: call.id, title: action.title, summary: check.ok && check.note ? `${text}\n${check.note}` : text };
      });
      return { messages, reply: reply.content, pending, done };
    }
    for (const call of calls) {
      messages.push({ role: "tool", tool_call_id: call.id, content: await run(call) });
    }
  }
  const stop = "Mi fermo qui: la richiesta richiedeva troppi passaggi. Prova a dividerla in parti più semplici.";
  messages.push({ role: "assistant", content: stop });
  return { messages, reply: stop, pending: [], done };
}
