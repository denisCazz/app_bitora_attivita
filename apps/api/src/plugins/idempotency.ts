import { Prisma } from "@prisma/client";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { verifyAccess } from "../lib/auth";
import { prisma } from "../lib/prisma";

const HEADER = "idempotency-key";
const KEY_PATTERN = /^[A-Za-z0-9_-]{8,100}$/;
const WRITES = new Set(["POST", "PUT", "PATCH", "DELETE"]);
/** A first attempt still "running" after this long died with the process: let the retry through. */
const STALE_MS = 2 * 60 * 1000;
const KEEP_MS = 7 * 24 * 60 * 60 * 1000;
const SWEEP_MS = 60 * 60 * 1000;

async function requester(request: FastifyRequest): Promise<string | null> {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  try {
    return (await verifyAccess(header.slice(7))).sub;
  } catch {
    return null;
  }
}

function inFlight(reply: FastifyReply) {
  return reply.code(409).header("retry-after", "5").send({ error: "Questa modifica è già in invio" });
}

/**
 * Writes carrying an Idempotency-Key run once per user and key. A retry of a request that already
 * succeeded gets the stored response back, so the offline queue can resend without duplicating work.
 */
export async function idempotencyPlugin(app: FastifyInstance) {
  app.addHook("onRequest", async (request, reply) => {
    const key = request.headers[HEADER];
    if (typeof key !== "string" || !WRITES.has(request.method)) return;
    if (!KEY_PATTERN.test(key)) return reply.code(400).send({ error: "Idempotency-Key non valida" });
    const userId = await requester(request);
    if (!userId) return;

    const existing = await prisma.idempotentRequest.findUnique({ where: { userId_key: { userId, key } } });
    if (existing) {
      if (existing.method !== request.method || existing.path !== request.url) {
        return reply.code(422).send({ error: "Idempotency-Key già usata per un'altra richiesta" });
      }
      if (existing.statusCode !== null) {
        reply.code(existing.statusCode).header("idempotent-replayed", "true");
        if (existing.response === null) return reply.send();
        return reply.type("application/json; charset=utf-8").send(existing.response);
      }
      if (Date.now() - existing.updatedAt.getTime() < STALE_MS) return inFlight(reply);
      await prisma.idempotentRequest.delete({ where: { id: existing.id } }).catch(() => undefined);
    }

    try {
      const row = await prisma.idempotentRequest.create({
        data: { userId, key, method: request.method, path: request.url },
        select: { id: true },
      });
      request.idempotentRequestId = row.id;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return inFlight(reply);
      throw error;
    }
  });

  app.addHook("onSend", async (request, reply, payload) => {
    const id = request.idempotentRequestId;
    if (!id) return payload;
    request.idempotentRequestId = undefined;
    const succeeded = reply.statusCode >= 200 && reply.statusCode < 300;
    if (succeeded && (typeof payload === "string" || payload == null)) {
      await prisma.idempotentRequest
        .update({ where: { id }, data: { statusCode: reply.statusCode, response: typeof payload === "string" ? payload : null } })
        .catch((error: unknown) => request.log.error(error, "Risposta idempotente non salvata"));
    } else {
      await prisma.idempotentRequest.delete({ where: { id } }).catch(() => undefined);
    }
    return payload;
  });

  const sweep = setInterval(() => {
    void prisma.idempotentRequest
      .deleteMany({ where: { createdAt: { lt: new Date(Date.now() - KEEP_MS) } } })
      .catch((error: unknown) => app.log.error(error, "Pulizia chiavi idempotenti non riuscita"));
  }, SWEEP_MS);
  sweep.unref();
  app.addHook("onClose", async () => clearInterval(sweep));
}
