export function euro(value: unknown) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(value ?? 0));
}

export function when(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function toLocalInput(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromLocalInput(value: string) {
  const text = value.trim();
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

/** "Cucina" → "in cucina", "Banco" → "al banco". Vuoto se il nome non dice dove va. */
export function towardStation(label: string) {
  const name = label.trim();
  const lower = name.toLowerCase();
  if (!name || lower === "generale" || lower === "main") return "";
  return /^(banco|bar|bancone)\b/.test(lower) ? `al ${lower}` : `in ${lower}`;
}

export function stationPhrase(labels: string[], joiner: "o" | "e" = "o") {
  const parts = [...new Set(labels.map(towardStation).filter(Boolean))];
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0]!;
  return `${parts.slice(0, -1).join(", ")} ${joiner} ${parts[parts.length - 1]}`;
}

export function lineStatusLabel(status: string, stationLabel: string) {
  if (status === "SENT") {
    const where = towardStation(stationLabel);
    return where ? `Inviato ${where}` : "Inviato";
  }
  if (status === "PENDING") return "Non ancora inviata";
  return STATUS_LABEL[status] ?? status;
}

export const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Bozza",
  SCHEDULED: "In programma",
  IN_PROGRESS: "In corso",
  DONE: "Fatto",
  CANCELLED: "Annullato",
  OPEN: "Aperto",
  SENT: "Inviato",
  RECEIVED: "Ricevuto",
  PARTIAL: "In parte inviata",
  CLOSED: "Chiuso",
  VOID: "Annullato",
  PENDING: "Da inviare",
  READY: "Pronto",
  SERVED: "Servito",
  PLANNED: "Pianificato",
  CONFIRMED: "Confermato",
};
