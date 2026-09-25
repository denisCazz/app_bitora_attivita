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

export const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Bozza",
  SCHEDULED: "In programma",
  IN_PROGRESS: "In corso",
  DONE: "Fatto",
  CANCELLED: "Annullato",
  OPEN: "Aperto",
  SENT: "Inviato",
  PARTIAL: "In sala",
  CLOSED: "Chiuso",
  VOID: "Annullato",
  PENDING: "Da inviare",
  READY: "Pronto",
  SERVED: "Servito",
  PLANNED: "Pianificato",
  CONFIRMED: "Confermato",
};
