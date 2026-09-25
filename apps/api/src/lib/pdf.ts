import PDFDocument from "pdfkit";
import type { Asset, Attachment, ChecklistRun, Customer, WorkOrder } from "@prisma/client";

type Report = WorkOrder & {
  customer: Customer | null;
  asset: Asset | null;
  attachments: Attachment[];
  checklistRuns: ChecklistRun[];
};

export function renderWorkOrderPdf(report: Report, shopName: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(12).fillColor("#E25B2A").text(shopName.toUpperCase());
    doc.moveDown(0.4);
    doc.fillColor("#1A1814").fontSize(24).text("Rapportino d'intervento");
    doc.moveDown(0.3);
    doc.fontSize(11).fillColor("#5E574E").text(`Documento ${report.id}`);
    doc.moveDown();
    doc.fillColor("#1A1814").fontSize(14).text(report.title);
    doc.moveDown(0.6);
    doc.fontSize(11);
    doc.text(`Stato: ${report.status}`);
    doc.text(`Cliente: ${report.customer?.name ?? "—"}`);
    if (report.asset) {
      doc.text(`Impianto: ${report.asset.name} ${report.asset.brand ?? ""} ${report.asset.model ?? ""}`.trim());
      if (report.asset.serialNumber) doc.text(`Matricola: ${report.asset.serialNumber}`);
    }
    if (report.scheduledAt) doc.text(`Programmato: ${report.scheduledAt.toLocaleString("it-IT")}`);
    if (report.completedAt) doc.text(`Completato: ${report.completedAt.toLocaleString("it-IT")}`);
    if (report.description) {
      doc.moveDown();
      doc.fontSize(12).text("Note");
      doc.fontSize(11).text(report.description);
    }
    for (const run of report.checklistRuns) {
      const answers = Array.isArray(run.answers) ? run.answers : [];
      doc.moveDown();
      doc.fontSize(12).text("Checklist");
      doc.fontSize(11);
      for (const answer of answers as Array<{ id?: string; label?: string; checked?: boolean; note?: string }>) {
        const written = answer.note?.trim();
        const title = answer.label?.trim() || answer.id || "Voce";
        doc.text(written ? `${title}: ${written}` : `${answer.checked ? "[x]" : "[ ]"} ${title}`);
      }
    }
    if (report.attachments.length) {
      doc.moveDown();
      doc.fontSize(12).text(`Allegati: ${report.attachments.length}`);
    }
    doc.moveDown(2);
    doc.fontSize(12).text(report.signedBy ? `Firmato da ${report.signedBy}` : "In attesa di firma");
    if (report.signatureData) doc.fontSize(9).fillColor("#5E574E").text("Firma acquisita sul dispositivo");
    doc.end();
  });
}
