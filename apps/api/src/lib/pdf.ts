import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { DEFAULT_ACCENT } from "@rapportini/shared";
import PDFDocument from "pdfkit";
import { uploadDirectory } from "./storage";

const INK = "#121318";
const MUTED = "#5C606C";
const LINE = "#E4E6EC";
const WASH = "#F6F7F9";
const RULE = "#D9DCE3";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Bozza",
  SCHEDULED: "In programma",
  IN_PROGRESS: "In corso",
  DONE: "Completato",
  CANCELLED: "Annullato",
};

type Answer = { label?: string; checked?: boolean; note?: string };
type Stroke = Array<{ x: number; y: number }>;

export type WorkOrderReport = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  scheduledAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  signatureData: string | null;
  signedBy: string | null;
  technicianSignature: string | null;
  technicianSignedBy: string | null;
  technicianSignedAt: Date | null;
  customFields: unknown;
  customer: {
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    city: string | null;
  } | null;
  asset: {
    name: string;
    type: string | null;
    brand: string | null;
    model: string | null;
    serialNumber: string | null;
    location: { name: string; address: string | null; city: string | null } | null;
  } | null;
  assignee: { name: string } | null;
  attachments: Array<{ fileName: string; mimeType: string; url: string }>;
  checklistRuns: Array<{ answers: unknown; template: { name: string } | null }>;
  stockMovements: Array<{
    quantity: { toString(): string } | number | string;
    part: { name: string; sku: string; unitPrice: { toString(): string } | number | string } | null;
    location: { name: string } | null;
  }>;
};

export type WorkOrderPdfContext = {
  shopName: string;
  shopAddress?: string | null;
  accent?: string | null;
  documentTitle: string;
  labels: {
    customer: string;
    asset: string;
    spareParts: string;
    technician: string;
  };
  fields: Array<{ key: string; label: string; type: string }>;
};

type Photo = { name: string; data: Buffer };

const IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png"]);

export async function renderWorkOrderPdf(report: WorkOrderReport, context: WorkOrderPdfContext): Promise<Buffer> {
  const photos = await loadPhotos(report.attachments);
  const accent = /^#[0-9A-Fa-f]{6}$/.test(context.accent ?? "") ? context.accent! : DEFAULT_ACCENT;
  const code = report.id.replace(/[^a-z0-9]/gi, "").slice(-8).toUpperCase();

  return new Promise((resolvePdf, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 36, bottom: 54, left: 42, right: 42 },
      bufferPages: true,
      info: {
        Title: `${context.documentTitle} ${code}`,
        Author: context.shopName,
      },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolvePdf(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = doc.page.margins.left;
    const width = doc.page.width - left - doc.page.margins.right;
    let y = doc.page.margins.top;

    const limit = () => doc.page.height - doc.page.margins.bottom;
    const sync = (next: number) => {
      y = next;
      doc.y = next;
      doc.x = left;
    };
    const blank = () => {
      doc.addPage();
      sync(doc.page.margins.top);
    };
    const ensure = (height: number) => {
      if (y + height > limit()) blank();
    };

    function text(value: string, x: number, at: number, size: number, options: PDFKit.Mixins.TextOptions & { font?: string; color?: string } = {}) {
      doc.font(options.font ?? "Helvetica").fontSize(size).fillColor(options.color ?? INK);
      doc.text(value, x, at, options);
      return doc.y;
    }

    function heading(label: string, keep = 28) {
      ensure(48 + keep);
      sync(y + 18);
      text(label.toUpperCase(), left, y, 8, { font: "Helvetica-Bold", color: accent, characterSpacing: 0.7, width });
      sync(doc.y + 5);
      doc.moveTo(left, y).lineTo(left + width, y).lineWidth(0.6).strokeColor(RULE).stroke();
      sync(y + 10);
    }

    const shopLines = context.shopAddress ? 2 : 1;
    ensure(28 + shopLines * 16);
    const rightX = left + width * 0.56;
    const rightW = width * 0.44;
    text(context.shopName, left, y, 16, { font: "Helvetica-Bold", width: width * 0.52 });
    const shopBottom = doc.y;
    if (context.shopAddress) text(context.shopAddress, left, shopBottom + 2, 9, { color: MUTED, width: width * 0.52 });
    const headerLeftBottom = doc.y;
    text(context.documentTitle, rightX, y, 9, { font: "Helvetica-Bold", color: accent, width: rightW, align: "right" });
    text(`n. ${code}`, rightX, doc.y + 2, 12, { font: "Helvetica-Bold", width: rightW, align: "right" });
    text(formatWhen(new Date()) ?? "", rightX, doc.y + 2, 9, { color: MUTED, width: rightW, align: "right" });
    sync(Math.max(headerLeftBottom, doc.y) + 12);
    doc.moveTo(left, y).lineTo(left + width, y).lineWidth(1).strokeColor(INK).stroke();
    sync(y + 16);

    text(report.title || context.documentTitle, left, y, 18, { font: "Helvetica-Bold", width });
    sync(doc.y + 12);

    const cells: Array<[string, string]> = [
      ["Stato", STATUS_LABEL[report.status] ?? report.status],
      [context.labels.technician, report.assignee?.name || "Non assegnato"],
      ["Programmato", formatCompact(report.scheduledAt)],
      ["Completato", formatCompact(report.completedAt)],
    ];
    const cellW = width / cells.length;
    const cellH = 58;
    ensure(cellH + 4);
    doc.roundedRect(left, y, width, cellH, 8).fill(WASH);
    cells.forEach(([label, value], index) => {
      const x = left + index * cellW;
      text(label.toUpperCase(), x + 10, y + 8, 7, { font: "Helvetica-Bold", color: MUTED, width: cellW - 16, characterSpacing: 0.4 });
      text(value, x + 10, y + 22, 9.5, { font: "Helvetica-Bold", width: cellW - 16, height: 28 });
    });
    sync(y + cellH + 6);

    const customerLines = partyLines(report.customer);
    const assetLines = assetLinesOf(report.asset);
    doc.font("Helvetica-Bold").fontSize(11);
    const inner = width / 2 - 18 - 16;
    const customerBody = measureLines(doc, customerLines, inner);
    const assetBody = measureLines(doc, assetLines, inner);
    const cardH = 34 + Math.max(customerBody, assetBody);
    ensure(cardH);
    drawParty(doc, left, y, width / 2 - 6, cardH, context.labels.customer, customerLines, accent);
    drawParty(doc, left + width / 2 + 6, y, width / 2 - 6, cardH, context.labels.asset, assetLines, accent);
    sync(y + cardH);

    if (report.description?.trim()) {
      heading("Descrizione");
      doc.font("Helvetica").fontSize(10.5).fillColor(INK);
      doc.text(report.description.trim(), left, y, { width, lineGap: 2 });
      sync(doc.y);
    }

    const details = fieldLines(report.customFields, context.fields);
    if (details.length) {
      heading("Dettagli");
      for (const row of details) {
        doc.font(row.missing ? "Helvetica-Oblique" : "Helvetica").fontSize(10);
        const rowH = doc.heightOfString(row.value, { width: width * 0.62 });
        ensure(rowH + 8);
        text(row.label, left, y, 10, { color: MUTED, width: width * 0.34 });
        const afterLabel = doc.y;
        text(row.value, left + width * 0.36, y, 10, {
          font: row.missing ? "Helvetica-Oblique" : "Helvetica",
          color: row.missing ? MUTED : INK,
          width: width * 0.64,
        });
        sync(Math.max(afterLabel, doc.y) + 4);
      }
    }

    if (report.checklistRuns.length) {
      heading("Controlli");
      for (const run of report.checklistRuns) {
        const answers = parseAnswers(run.answers);
        if (run.template?.name) {
          ensure(18);
          text(run.template.name, left, y, 11, { font: "Helvetica-Bold", width });
          sync(doc.y + 6);
        }
        if (!answers.length) {
          ensure(16);
          text("Nessuna voce compilata", left, y, 10, { color: MUTED, width });
          sync(doc.y + 4);
          continue;
        }
        for (const answer of answers) {
          const label = answer.label?.trim() || "Voce";
          const note = answer.note?.trim() || "";
          const checked = answer.checked === true;
          const status = checked ? "Eseguito" : "Non eseguito";
          const statusW = 92;
          const labelW = width - 18 - statusW - 8;
          doc.font("Helvetica").fontSize(10.5);
          const labelH = doc.heightOfString(label, { width: labelW });
          const noteH = note ? doc.font("Helvetica").fontSize(9).heightOfString(note, { width: width - 18 }) : 0;
          ensure(labelH + noteH + 8);
          drawCheck(doc, left, y + 1, checked, accent);
          text(label, left + 18, y, 10.5, { width: labelW });
          const afterLabel = doc.y;
          text(status, left + width - statusW, y, 9, {
            font: "Helvetica-Bold",
            color: checked ? accent : MUTED,
            width: statusW,
            align: "right",
          });
          let bottom = Math.max(afterLabel, doc.y);
          if (note) {
            text(note, left + 18, bottom + 1, 9, { color: MUTED, width: width - 18 });
            bottom = doc.y;
          }
          sync(bottom + 7);
        }
      }
    }

    const parts = partLines(report.stockMovements);
    if (parts.length) {
      heading(context.labels.spareParts);
      const showMoney = parts.some((part) => part.price > 0);
      const columns = showMoney
        ? [
            { label: "Qtà", width: 42, align: "right" as const },
            { label: "Descrizione", width: width - 42 - 88 - 72 - 78, align: "left" as const },
            { label: "Prelievo", width: 88, align: "left" as const },
            { label: "Prezzo", width: 72, align: "right" as const },
            { label: "Importo", width: 78, align: "right" as const },
          ]
        : [
            { label: "Qtà", width: 48, align: "right" as const },
            { label: "Descrizione", width: width - 48 - 130, align: "left" as const },
            { label: "Prelievo", width: 130, align: "left" as const },
          ];
      const drawHead = () => {
        ensure(22);
        doc.rect(left, y, width, 18).fill(WASH);
        let x = left;
        for (const column of columns) {
          text(column.label.toUpperCase(), x + 6, y + 5, 7.5, {
            font: "Helvetica-Bold",
            color: MUTED,
            width: column.width - 12,
            align: column.align,
            characterSpacing: 0.3,
          });
          x += column.width;
        }
        sync(y + 22);
      };
      drawHead();
      for (const part of parts) {
        doc.font("Helvetica").fontSize(10);
        const nameH = doc.heightOfString(part.name, { width: columns[1]!.width - 12 });
        if (y + nameH + 10 > limit()) {
          blank();
          drawHead();
        }
        const rowTop = y;
        const values = showMoney
          ? [formatQty(part.qty), part.name, part.place, euro(part.price), euro(part.qty * part.price)]
          : [formatQty(part.qty), part.name, part.place];
        let x = left;
        values.forEach((value, index) => {
          const column = columns[index]!;
          text(value, x + 6, rowTop, 10, { width: column.width - 12, align: column.align });
          x += column.width;
        });
        sync(rowTop + Math.max(nameH, 12) + 8);
        doc.moveTo(left, y).lineTo(left + width, y).lineWidth(0.4).strokeColor(LINE).stroke();
        sync(y + 6);
      }
      if (showMoney) {
        const total = parts.reduce((sum, part) => sum + part.qty * part.price, 0);
        ensure(22);
        text("Totale materiali", left, y, 10, { font: "Helvetica-Bold", width: width - 90 });
        text(euro(total), left, y, 11, { font: "Helvetica-Bold", width, align: "right" });
        sync(doc.y);
      }
    }

    const otherFiles = report.attachments.filter((file) => !IMAGE_TYPES.has(file.mimeType));
    if (photos.length || otherFiles.length) {
      const columns = photos.length > 1 ? 2 : 1;
      const gap = 8;
      const cellW = (width - gap * (columns - 1)) / columns;
      const cellH = photos.length === 0 ? 0 : columns === 1 ? 420 : 320;
      heading("Allegati", cellH + (otherFiles.length ? 36 : 12));
      if (photos.length) {
        const maxH = cellH;
        for (let index = 0; index < photos.length; index += columns) {
          const row = photos.slice(index, index + columns);
          const frames = row.map((photo) => fitFrame(photo.data, cellW, maxH));
          const rowH = Math.max(...frames.map((frame) => frame.h));
          ensure(rowH + 12);
          row.forEach((photo, column) => {
            const frame = frames[column] ?? { w: cellW, h: rowH };
            const x = left + column * (cellW + gap) + (cellW - frame.w) / 2;
            doc.save();
            doc.roundedRect(x, y, frame.w, frame.h, 6).clip();
            try {
              doc.image(photo.data, x, y, { cover: [frame.w, frame.h], align: "center", valign: "center" });
            } catch {
              doc.rect(x, y, frame.w, frame.h).fill(WASH);
              text(photo.name, x + 8, y + frame.h / 2 - 6, 9, { color: MUTED, width: frame.w - 16, align: "center" });
            }
            doc.restore();
            doc.roundedRect(x, y, frame.w, frame.h, 6).lineWidth(0.6).strokeColor(LINE).stroke();
          });
          sync(y + rowH + 8);
        }
      }
      if (otherFiles.length) {
        ensure(16);
        text(`Altri file: ${otherFiles.map((file) => file.fileName).join(", ")}`, left, y, 9, { color: MUTED, width });
        sync(doc.y);
      }
    }

    const boxW = width / 2 - 6;
    const boxH = 132;
    heading("Firme", boxH + 20);
    drawSignatureBox(doc, left, y, boxW, boxH, "Firma del cliente", report.signatureData, report.signedBy, formatWhen(report.completedAt), accent);
    drawSignatureBox(
      doc,
      left + boxW + 12,
      y,
      boxW,
      boxH,
      `Firma del ${context.labels.technician.toLowerCase()}`,
      report.technicianSignature,
      report.technicianSignedBy ?? report.assignee?.name ?? null,
      formatWhen(report.technicianSignedAt),
      accent,
    );
    sync(y + boxH + 10);
    text("Il cliente conferma di aver preso visione dell'intervento descritto in questo rapportino.", left, y, 8.5, { color: MUTED, width });
    sync(doc.y);

    const range = doc.bufferedPageRange();
    for (let page = 0; page < range.count; page += 1) {
      doc.switchToPage(page);
      const bottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc.save();
      doc.rect(0, 0, doc.page.width, 6).fill(accent);
      doc.rect(0, doc.page.height - 32, doc.page.width, 32).fill(WASH);
      doc.font("Helvetica").fontSize(8).fillColor(MUTED);
      doc.text(context.shopName, left, doc.page.height - 20, { width: width * 0.42, lineBreak: false });
      doc.text(`${page + 1} / ${range.count}`, left, doc.page.height - 20, { width, align: "center", lineBreak: false });
      doc.text(`n. ${code}`, left, doc.page.height - 20, { width, align: "right", lineBreak: false });
      doc.restore();
      doc.page.margins.bottom = bottom;
    }
    doc.end();
  });
}

function partyLines(customer: WorkOrderReport["customer"]): string[] {
  if (!customer) return ["Non indicato"];
  const place = [customer.address, customer.city].filter(Boolean).join(", ");
  return [customer.name, place, customer.phone ?? "", customer.email ?? ""].filter(Boolean);
}

function assetLinesOf(asset: WorkOrderReport["asset"]): string[] {
  if (!asset) return ["Non indicato"];
  const model = [asset.brand, asset.model].filter(Boolean).join(" ");
  const place = asset.location ? [asset.location.name, asset.location.address, asset.location.city].filter(Boolean).join(", ") : "";
  return [asset.name, asset.type ?? "", model, asset.serialNumber ? `Matricola ${asset.serialNumber}` : "", place].filter(Boolean);
}

function measureLines(doc: PDFKit.PDFDocument, lines: string[], inner: number): number {
  let height = 0;
  lines.forEach((line, index) => {
    doc.font(index === 0 ? "Helvetica-Bold" : "Helvetica").fontSize(index === 0 ? 11 : 9);
    height += doc.heightOfString(line, { width: inner }) + (index === 0 ? 3 : 2);
  });
  return height;
}

function drawParty(doc: PDFKit.PDFDocument, x: number, y: number, w: number, h: number, title: string, lines: string[], accent: string) {
  doc.roundedRect(x, y, w, h, 8).lineWidth(0.8).strokeColor(LINE).stroke();
  doc.font("Helvetica-Bold").fontSize(7.5).fillColor(accent);
  doc.text(title.toUpperCase(), x + 12, y + 10, { width: w - 24, characterSpacing: 0.5 });
  let cursor = y + 26;
  lines.forEach((line, index) => {
    doc.font(index === 0 ? "Helvetica-Bold" : "Helvetica").fontSize(index === 0 ? 11 : 9).fillColor(index === 0 ? INK : MUTED);
    doc.text(line, x + 12, cursor, { width: w - 24 });
    cursor = doc.y + (index === 0 ? 3 : 2);
  });
}

function drawCheck(doc: PDFKit.PDFDocument, x: number, y: number, on: boolean, accent: string) {
  doc.save();
  doc.roundedRect(x, y, 11, 11, 2).lineWidth(1).strokeColor(on ? accent : "#C5C8D0").stroke();
  if (on) {
    doc.moveTo(x + 2.2, y + 5.5).lineTo(x + 4.4, y + 7.8).lineTo(x + 8.7, y + 2.8).lineWidth(1.35).lineCap("round").lineJoin("round").strokeColor(accent).stroke();
  }
  doc.restore();
}

function drawSignatureBox(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  h: number,
  title: string,
  signature: string | null,
  name: string | null,
  when: string | null,
  accent: string,
) {
  doc.roundedRect(x, y, w, h, 8).lineWidth(0.8).strokeColor(LINE).stroke();
  doc.font("Helvetica-Bold").fontSize(7.5).fillColor(accent);
  doc.text(title.toUpperCase(), x + 12, y + 10, { width: w - 24, characterSpacing: 0.4 });
  const drawn = signature ? strokeSignature(doc, signature, x + 12, y + 28, w - 24, 62) : false;
  if (!drawn) {
    doc.font("Helvetica-Oblique").fontSize(9).fillColor(MUTED);
    doc.text("In attesa di firma", x + 12, y + 52, { width: w - 24 });
  }
  doc.moveTo(x + 12, y + h - 28).lineTo(x + w - 12, y + h - 28).lineWidth(0.6).strokeColor(RULE).stroke();
  const caption = drawn && name ? `Firmato da ${name}${when ? ` · ${when}` : ""}` : name ? name : " ";
  doc.font("Helvetica").fontSize(8).fillColor(MUTED);
  doc.text(caption, x + 12, y + h - 22, { width: w - 24, height: 16 });
  return drawn;
}

function strokeSignature(doc: PDFKit.PDFDocument, raw: string, x: number, y: number, w: number, h: number): boolean {
  let strokes: Stroke[];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return false;
    strokes = parsed.filter((stroke): stroke is Stroke => Array.isArray(stroke));
  } catch {
    return false;
  }
  const points = strokes.flat().filter((point) => Number.isFinite(point?.x) && Number.isFinite(point?.y));
  if (!points.length) return false;
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const boxW = Math.max(maxX - minX, 1);
  const boxH = Math.max(maxY - minY, 1);
  const scale = Math.min(w / boxW, h / boxH);
  const offsetX = x + (w - boxW * scale) / 2 - minX * scale;
  const offsetY = y + (h - boxH * scale) / 2 - minY * scale;
  doc.save();
  doc.rect(x, y, w, h).clip();
  doc.lineWidth(1.3).lineCap("round").lineJoin("round").strokeColor(INK);
  for (const stroke of strokes) {
    const usable = stroke.filter((point) => Number.isFinite(point?.x) && Number.isFinite(point?.y));
    if (usable.length === 1) {
      const point = usable[0]!;
      doc.circle(offsetX + point.x * scale, offsetY + point.y * scale, 0.8).fill(INK);
      continue;
    }
    if (usable.length < 2) continue;
    doc.moveTo(offsetX + usable[0]!.x * scale, offsetY + usable[0]!.y * scale);
    for (const point of usable.slice(1)) doc.lineTo(offsetX + point.x * scale, offsetY + point.y * scale);
    doc.stroke();
  }
  doc.restore();
  return true;
}

const NOT_INCLUDED = new Set(["no", "n", "false", "non incluso", "non inclusa", "escluso", "esclusa", "non eseguito", "non eseguita"]);

function fieldLines(values: unknown, fields: WorkOrderPdfContext["fields"]): Array<{ label: string; value: string; missing: boolean }> {
  const record = values && typeof values === "object" && !Array.isArray(values) ? (values as Record<string, unknown>) : {};
  const rows: Array<{ label: string; value: string; missing: boolean }> = [];
  const seen = new Set<string>();
  for (const field of fields) {
    if (field.type === "PHOTO") continue;
    seen.add(field.key);
    rows.push({ label: field.label, ...fieldState(field.type, record[field.key]) });
  }
  for (const [key, raw] of Object.entries(record)) {
    if (seen.has(key)) continue;
    const state = fieldState("TEXT", raw);
    if (state.missing) continue;
    rows.push({ label: key, ...state });
  }
  return rows;
}

function fieldState(type: string, raw: unknown): { value: string; missing: boolean } {
  if (typeof raw === "boolean") return raw ? { value: "Incluso", missing: false } : { value: "Non incluso", missing: true };
  const formatted = formatField(type, raw);
  if (!formatted || NOT_INCLUDED.has(formatted.trim().toLowerCase())) return { value: "Non incluso", missing: true };
  return { value: formatted, missing: false };
}

function formatField(type: string, value: unknown): string | null {
  if (value == null || value === "") return null;
  if (type === "NUMBER") {
    const number = Number(value);
    return Number.isFinite(number) ? formatQty(number) : String(value);
  }
  if (type === "DATE") {
    const date = new Date(String(value));
    if (!Number.isNaN(date.getTime())) return formatWhen(date) ?? String(value);
  }
  return String(value);
}

function parseAnswers(value: unknown): Answer[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Answer => Boolean(item) && typeof item === "object");
}

function partLines(movements: WorkOrderReport["stockMovements"]) {
  return movements
    .filter((movement) => movement.part)
    .map((movement) => ({
      name: movement.part?.sku ? `${movement.part.name} · ${movement.part.sku}` : movement.part?.name ?? "",
      qty: Math.abs(Number(movement.quantity)),
      place: movement.location?.name ?? "",
      price: Number(movement.part?.unitPrice ?? 0),
    }))
    .filter((part) => part.name && part.qty > 0);
}

async function loadPhotos(attachments: WorkOrderReport["attachments"]): Promise<Photo[]> {
  const images = attachments.filter((file) => IMAGE_TYPES.has(file.mimeType)).slice(0, 6);
  const photos: Photo[] = [];
  for (const file of images) {
    const data = await readUpload(file.url);
    if (data) photos.push({ name: file.fileName, data });
  }
  return photos;
}

async function readUpload(url: string): Promise<Buffer | null> {
  const marker = "/uploads/";
  const index = url.indexOf(marker);
  if (index < 0) return null;
  const name = basename(decodeURIComponent(url.slice(index + marker.length).split("?")[0] ?? ""));
  if (!name || name === "." || name === "..") return null;
  try {
    return await readFile(resolve(uploadDirectory(), name));
  } catch {
    return null;
  }
}

function formatWhen(value: Date | null): string | null {
  if (!value || Number.isNaN(value.getTime())) return null;
  return value.toLocaleString("it-IT", {
    timeZone: "Europe/Rome",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatCompact(value: Date | null): string {
  if (!value || Number.isNaN(value.getTime())) return "Non indicato";
  const day = value.toLocaleDateString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "short", year: "numeric" });
  const time = value.toLocaleTimeString("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" });
  return `${day}\n${time}`;
}

function fitFrame(data: Buffer, maxW: number, maxH: number): { w: number; h: number } {
  const size = imageSize(data);
  if (!size) return { w: maxW, h: Math.min(maxH, 180) };
  const scale = Math.min(maxW / size.width, maxH / size.height);
  return { w: Math.round(size.width * scale), h: Math.round(size.height * scale) };
}

function imageSize(data: Buffer): { width: number; height: number } | null {
  if (data.length > 24 && data[0] === 0x89 && data.toString("ascii", 1, 4) === "PNG") {
    return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
  }
  if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < data.length) {
    if (data[offset] !== 0xff) return null;
    const marker = data[offset + 1] ?? 0;
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2;
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = data.readUInt16BE(offset + 2);
    if (length < 2) return null;
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: data.readUInt16BE(offset + 5), width: data.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  return null;
}

function formatQty(value: number): string {
  return new Intl.NumberFormat("it-IT", { maximumFractionDigits: 3 }).format(value);
}

function euro(value: number): string {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(value);
}
