import { GENERIC_CATEGORY_KEY, parseActivitySetup, trialKeys, type ActivityProposal, type CatalogModule } from "@rapportini/shared";
import { HttpError } from "../../errors";
import { resolvedCategory } from "../catalog";
import { completeJson } from "./openai";

function catalogPrompt(modules: readonly CatalogModule[]): string {
  const lines = modules.map((module) => {
    const price = module.free ? "già incluso gratis, non sceglierlo" : `a pagamento, prova ${module.trialDays} giorni`;
    const requires = module.requires.length ? `richiede ${module.requires.join(", ")}` : "nessuna dipendenza";
    return `- ${module.key}: ${module.label}. ${module.pitch || module.description} (${price}; ${requires})`;
  });
  return [
    "Sei il configuratore di Bitora. Un'attività non rientra nelle categorie già pronte: dalla descrizione prepari parole, campi e i moduli più utili.",
    "Rispondi solo con un oggetto JSON, in italiano, con queste chiavi:",
    `{"activity":"nome breve del mestiere","summary":"una frase su come userà l'app","terminology":{"workOrder":"","workOrders":"","asset":"","assets":"","customer":"","customers":"","sparePart":"","spareParts":"","warehouse":"","vehicle":""},"assetTypes":[],"customFields":[{"entity":"CUSTOMER","key":"snake_case","label":"","type":"TEXT","options":[]}],"checklists":[{"name":"","kind":"MAIUSCOLO","items":[{"id":"snake","label":""}]}],"scheduleKinds":[{"key":"MAIUSCOLO","label":"","tone":"accent"}],"stations":[{"key":"MAIUSCOLO","label":""}],"modules":[]}`,
    "",
    "Moduli:",
    ...lines,
    "",
    "Regole:",
    "- activity e summary sono obbligatori. Le parole in terminology sono quelle del mestiere, al singolare e al plurale.",
    "- modules: al massimo 4 chiavi, solo moduli a pagamento, i più pertinenti. Se ne scegli uno che ne richiede un altro, includi anche quello.",
    "- Un mestiere che esce a fare lavori: interventi, impianti, calendario, ricambi. Un mestiere in sede con appuntamenti: calendario e checklist. Un locale che serve da mangiare o bere: menu, comande e sala.",
    "- customFields solo se servono davvero (massimo 4). entity è CUSTOMER, ASSET, WORK_ORDER o PRODUCT. type è TEXT, NUMBER, DATE, SELECT o PHOTO. SELECT ha almeno due options.",
    "- key dei campi e id delle voci in snake_case. kind e key di scadenze e reparti in MAIUSCOLO.",
    "- assetTypes, scheduleKinds e stations vuoti se non aggiungono niente.",
    "- Non inventare moduli e non rifiutare la richiesta: se la descrizione è vaga, scegli il minimo utile e dillo in summary.",
  ].join("\n");
}

export async function suggestActivity(categoryId: string, description: string): Promise<ActivityProposal> {
  const category = await resolvedCategory(categoryId);
  if (category.key !== GENERIC_CATEGORY_KEY) throw new HttpError(400, "Questa categoria non si configura da una descrizione");
  let setup;
  try {
    setup = parseActivitySetup(await completeJson(catalogPrompt(category.modules), description));
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, error instanceof Error ? error.message : "Non sono riuscito a leggere la configurazione. Riprova.");
  }
  const paid = new Set(category.modules.filter((module) => !module.free).map((module) => module.key));
  const modules = setup.modules.filter((key) => paid.has(key));
  return { ...setup, modules, trials: trialKeys(category.modules, modules, 6) };
}
