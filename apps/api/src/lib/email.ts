import { env } from "../env";

export interface OutgoingEmail {
  /** Shown as sender name in front of RESEND_FROM. */
  fromName: string;
  to: string;
  replyTo?: string | null;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  /** Resend drops a second send with the same key within 24 hours. */
  idempotencyKey: string;
}

export function emailReady() {
  return Boolean(env.resend.apiKey && env.resend.from);
}

function senderName(name: string) {
  return name.replace(/["<>\r\n]/g, "").trim().slice(0, 60) || "Bitora";
}

export async function sendEmail(email: OutgoingEmail): Promise<{ id: string }> {
  if (!env.resend.apiKey || !env.resend.from) throw new Error("Email non configurata: imposta RESEND_API_KEY e RESEND_FROM");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.resend.apiKey}`,
      "content-type": "application/json",
      "idempotency-key": email.idempotencyKey,
    },
    body: JSON.stringify({
      from: `"${senderName(email.fromName)}" <${env.resend.from}>`,
      to: [email.to],
      reply_to: email.replyTo ? [email.replyTo] : undefined,
      subject: email.subject,
      html: email.html,
      text: email.text,
      headers: email.headers,
    }),
  });
  const data = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!response.ok || !data.id) throw new Error(data.message ?? `Resend ha risposto ${response.status}`);
  return { id: data.id };
}
