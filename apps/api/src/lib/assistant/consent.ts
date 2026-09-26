import type { FastifyReply, FastifyRequest } from "fastify";
import { HttpError } from "../../errors";
import { isDemoEmail } from "../account";
import { prisma } from "../prisma";

export async function assertAiConsent(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, aiConsentAt: true } });
  if (user && (user.aiConsentAt || isDemoEmail(user.email))) return;
  throw new HttpError(428, "Per usare l'assistente accetta prima l'informativa sull'IA");
}

export async function requireAiConsent(request: FastifyRequest, reply: FastifyReply) {
  if (!request.auth) return;
  try {
    await assertAiConsent(request.auth.userId);
  } catch (error) {
    if (error instanceof HttpError) return reply.code(error.statusCode).send({ error: error.message });
    throw error;
  }
}
