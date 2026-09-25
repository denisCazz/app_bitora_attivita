import { env } from "../../env";
import { HttpError } from "../../errors";

const BASE_URL = "https://api.openai.com/v1";

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export type ChatMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

function apiKey(): string {
  if (!env.openai.apiKey) throw new HttpError(503, "Assistente non configurato: manca OPENAI_API_KEY");
  return env.openai.apiKey;
}

async function failure(response: Response): Promise<never> {
  const detail = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  throw new HttpError(502, `Assistente non disponibile${detail?.error?.message ? `: ${detail.error.message}` : ""}`);
}

export async function complete(system: string, messages: ChatMessage[], tools: unknown[]): Promise<Extract<ChatMessage, { role: "assistant" }>> {
  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey()}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: env.openai.model,
      temperature: 0.2,
      messages: [{ role: "system", content: system }, ...messages],
      ...(tools.length ? { tools, tool_choice: "auto" } : {}),
    }),
  });
  if (!response.ok) await failure(response);
  const data = (await response.json()) as { choices: Array<{ message: { content: string | null; tool_calls?: ToolCall[] } }> };
  const message = data.choices[0]?.message;
  if (!message) throw new HttpError(502, "Risposta vuota dall'assistente");
  return { role: "assistant", content: message.content ?? null, ...(message.tool_calls?.length ? { tool_calls: message.tool_calls } : {}) };
}

export async function completeJson(system: string, user: string): Promise<unknown> {
  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey()}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: env.openai.model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!response.ok) await failure(response);
  const data = (await response.json()) as { choices: Array<{ message: { content: string | null } }> };
  const text = data.choices[0]?.message.content;
  if (!text) throw new HttpError(502, "Risposta vuota dall'assistente");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export async function speak(text: string): Promise<ReadableStream<Uint8Array>> {
  const response = await fetch(`${BASE_URL}/audio/speech`, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey()}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: env.openai.speechModel,
      voice: env.openai.speechVoice,
      input: text,
      response_format: "mp3",
      instructions: "Parla in italiano con accento neutro, tono caldo, calmo e naturale, come un collega esperto. Ritmo scorrevole, niente enfasi da spot.",
    }),
  });
  if (!response.ok || !response.body) await failure(response);
  return response.body!;
}

export async function transcribe(audio: Buffer, fileName: string, mimeType: string): Promise<string> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(audio)], { type: mimeType }), fileName);
  form.append("model", env.openai.transcribeModel);
  form.append("language", "it");
  form.append("temperature", "0");
  const segmented = env.openai.transcribeModel.startsWith("whisper");
  if (segmented) form.append("response_format", "verbose_json");
  const response = await fetch(`${BASE_URL}/audio/transcriptions`, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey()}` },
    body: form,
  });
  if (!response.ok) await failure(response);
  const data = (await response.json()) as { text?: string; segments?: Segment[] };
  const text = segmented && data.segments ? data.segments.filter(spoken).map((segment) => segment.text).join(" ") : (data.text ?? "");
  return withoutHallucinations(text);
}

interface Segment {
  text: string;
  no_speech_prob?: number;
  avg_logprob?: number;
}

function spoken(segment: Segment): boolean {
  return !((segment.no_speech_prob ?? 0) > 0.5 && (segment.avg_logprob ?? 0) < -0.7);
}

// Whisper fills silence and background noise with captions it learned from subtitled videos.
const SENTENCE_TAIL = String.raw`(?:[^.!?]|\.(?=\w))*[.!?]?`;
const HALLUCINATIONS = [
  String.raw`sottotitoli\s+(creati|a\s+cura|e\s+revisione|realizzati|di)`,
  String.raw`\b(dalla\s+)?comunit[àa]\s+amara`,
  String.raw`\bamara\.org\b`,
  String.raw`\bqtss\b`,
  String.raw`grazie\s+(a\s+tutti\s+)?per\s+(la\s+)?(visione|l'attenzione|aver\s+guardato)`,
  String.raw`(iscriviti|iscrivetevi)\s+al\s+(mio\s+)?canale`,
  String.raw`(ci\s+vediamo|alla\s+prossima)\s+(al|nel)\s+prossimo\s+video`,
  String.raw`\bsubtitles?\s+by\b`,
].map((start) => new RegExp(start + SENTENCE_TAIL, "giu"));

export function withoutHallucinations(raw: string): string {
  const text = HALLUCINATIONS.reduce((current, pattern) => current.replace(pattern, " "), raw)
    .replace(/\s+/g, " ")
    .trim();
  return /[\p{L}\p{N}]/u.test(text) ? text : "";
}
