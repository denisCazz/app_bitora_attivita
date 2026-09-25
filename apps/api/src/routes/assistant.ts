import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { HttpError, parseBody } from "../errors";
import { runAssistant, type AssistantResult } from "../lib/assistant/agent";
import { transcribe } from "../lib/assistant/openai";
import { prepareSpeech, speechAudio } from "../lib/assistant/speech";
import { manifestFor } from "../lib/manifest";
import { tenantId } from "../plugins/auth";

const toolCallSchema = z.object({
  id: z.string().max(100),
  type: z.literal("function"),
  function: z.object({ name: z.string().max(80), arguments: z.string().max(20_000) }),
});

const messageSchema = z.discriminatedUnion("role", [
  z.object({ role: z.literal("user"), content: z.string().max(4000) }),
  z.object({ role: z.literal("assistant"), content: z.string().max(8000).nullable(), tool_calls: z.array(toolCallSchema).max(20).optional() }),
  z.object({ role: z.literal("tool"), tool_call_id: z.string().max(100), content: z.string().max(20_000) }),
]);

const chatSchema = z
  .object({
    messages: z.array(messageSchema).max(200).default([]),
    text: z.string().trim().max(2000).optional(),
    decision: z.enum(["approve", "reject"]).optional(),
    voice: z.boolean().optional(),
  })
  .refine((value) => Boolean(value.text) || Boolean(value.decision), { message: "Scrivi un messaggio" });

function ownerOf(request: FastifyRequest): string {
  return `${request.auth!.userId}:${tenantId(request)}`;
}

function spoken(result: AssistantResult): string {
  const parts = [result.reply ?? ""];
  if (result.pending.length) parts.push(`${result.pending.map((action) => action.summary).join(". ")}. Confermi?`);
  return parts.filter(Boolean).join(" ");
}

async function sendAudio(request: FastifyRequest, reply: FastifyReply, id: string) {
  const audio = await speechAudio(ownerOf(request), id);
  reply.header("content-type", "audio/mpeg");
  reply.header("accept-ranges", "bytes");
  reply.header("cache-control", "private, max-age=300");
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range ?? "");
  if (!range) {
    reply.header("content-length", audio.length);
    return reply.send(audio);
  }
  const start = range[1] ? Number(range[1]) : Math.max(0, audio.length - Number(range[2]));
  const end = range[1] && range[2] ? Math.min(Number(range[2]), audio.length - 1) : audio.length - 1;
  if (start >= audio.length || start > end) {
    reply.header("content-range", `bytes */${audio.length}`);
    return reply.code(416).send();
  }
  reply.code(206);
  reply.header("content-range", `bytes ${start}-${end}/${audio.length}`);
  reply.header("content-length", end - start + 1);
  return reply.send(audio.subarray(start, end + 1));
}

export async function assistantRoutes(app: FastifyInstance) {
  app.post("/assistant/chat", { preHandler: app.requireTenant }, async (request) => {
    const body = parseBody(chatSchema, request.body);
    const manifest = await manifestFor(request.auth!.userId, tenantId(request));
    const result = await runAssistant(app, request, manifest, { ...body, messages: body.messages ?? [] });
    const speech = body.voice ? prepareSpeech(ownerOf(request), spoken(result)) : null;
    return { ...result, speech };
  });

  app.get("/assistant/speech/:id", { preHandler: app.requireTenant }, async (request, reply) => {
    return sendAudio(request, reply, (request.params as { id: string }).id);
  });

  app.get("/assistant/speech", { preHandler: app.requireTenant }, async (request, reply) => {
    const id = prepareSpeech(ownerOf(request), String((request.query as { text?: string }).text ?? ""));
    if (!id) throw new HttpError(400, "Testo mancante");
    return sendAudio(request, reply, id);
  });

  app.post("/assistant/transcribe", { preHandler: app.requireTenant }, async (request) => {
    const file = await request.file();
    if (!file) throw new HttpError(400, "Audio mancante");
    const text = await transcribe(await file.toBuffer(), file.filename || "voce.m4a", file.mimetype || "audio/m4a");
    return { text };
  });
}
