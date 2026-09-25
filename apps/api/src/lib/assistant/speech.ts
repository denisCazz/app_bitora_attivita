import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { env } from "../../env";
import { HttpError } from "../../errors";
import { speak as openaiSpeak } from "./openai";

const CACHE_TTL_MS = 5 * 60_000;
const CACHE_MAX = 60;
const SYNTH_TIMEOUT_MS = 20_000;

interface Clip {
  owner: string;
  audio: Promise<Buffer>;
  at: number;
}

const clips = new Map<string, Clip>();

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export function speakable(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[*_`#>]+/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/([:;,.!?])?\s*\n+\s*/g, (_match, mark?: string) => (mark ? `${mark} ` : ". "))
    .replace(/\.(\s*\.)+/g, ".")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 1500);
}

function collect(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => reject(new HttpError(504, "La voce ci mette troppo, riprova")), SYNTH_TIMEOUT_MS);
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.once("end", () => {
      clearTimeout(timer);
      resolve(Buffer.concat(chunks));
    });
    stream.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function fromResponse(response: Response, provider: string): Promise<Buffer> {
  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => "");
    throw new HttpError(502, `Voce ${provider} non disponibile${detail ? `: ${detail.slice(0, 200)}` : ""}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function edge(text: string): Promise<Buffer> {
  const tts = new MsEdgeTTS();
  try {
    await tts.setMetadata(env.speech.voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    return await collect(tts.toStream(escapeXml(text)).audioStream);
  } finally {
    tts.close();
  }
}

async function azure(text: string): Promise<Buffer> {
  const { key, region } = env.speech.azure;
  if (!key || !region) throw new HttpError(503, "Voce Azure non configurata: servono AZURE_SPEECH_KEY e AZURE_SPEECH_REGION");
  const ssml = `<speak version="1.0" xml:lang="it-IT"><voice name="${env.speech.voice}">${escapeXml(text)}</voice></speak>`;
  const response = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": key,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
      "User-Agent": "bitora-api",
    },
    body: ssml,
  });
  return fromResponse(response, "Azure");
}

async function elevenlabs(text: string): Promise<Buffer> {
  const { key, voiceId, model } = env.speech.elevenlabs;
  if (!key || !voiceId) throw new HttpError(503, "Voce ElevenLabs non configurata: servono ELEVENLABS_API_KEY e ELEVENLABS_VOICE_ID");
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({ text, model_id: model, language_code: "it" }),
  });
  return fromResponse(response, "ElevenLabs");
}

async function synthesize(text: string): Promise<Buffer> {
  switch (env.speech.provider) {
    case "azure":
      return azure(text);
    case "elevenlabs":
      return elevenlabs(text);
    case "openai":
      return collect(Readable.fromWeb((await openaiSpeak(text)) as unknown as WebReadableStream));
    default:
      return edge(text);
  }
}

function prune(now: number) {
  for (const [id, clip] of clips) {
    if (now - clip.at > CACHE_TTL_MS || clips.size > CACHE_MAX) clips.delete(id);
  }
}

export function prepareSpeech(owner: string, raw: string): string | null {
  const text = speakable(raw);
  if (!text) return null;
  const id = createHash("sha256").update(`${owner}|${env.speech.provider}|${env.speech.voice}|${text}`).digest("hex").slice(0, 32);
  const now = Date.now();
  prune(now);
  const existing = clips.get(id);
  if (existing) {
    existing.at = now;
    return id;
  }
  const audio = synthesize(text);
  audio.catch(() => clips.delete(id));
  clips.set(id, { owner, audio, at: now });
  return id;
}

export async function speechAudio(owner: string, id: string): Promise<Buffer> {
  const clip = clips.get(id);
  if (!clip || clip.owner !== owner) throw new HttpError(404, "Audio scaduto");
  return clip.audio;
}
