import { payRateSchema, payrollMonthOf } from "@rapportini/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { HttpError, must, parseBody } from "../errors";
import { syncPayrollMonth } from "../lib/payroll";
import { prisma } from "../lib/prisma";
import { tenantId } from "../plugins/auth";
import { moduleGuard, permit } from "../plugins/guards";

const monthSchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
});

function currentMonth() {
  return payrollMonthOf(new Date());
}

export async function payrollRoutes(app: FastifyInstance) {
  const read = { preHandler: [app.requireTenant, permit("shifts.read"), moduleGuard("shifts")] };
  const write = { preHandler: [app.requireTenant, permit("shifts.write"), moduleGuard("shifts")] };

  app.get("/payroll", read, async (request) => {
    const query = parseBody(monthSchema, request.query ?? {});
    try {
      return await syncPayrollMonth(tenantId(request), query.month ?? currentMonth());
    } catch (error) {
      if (error instanceof Error && error.message === "Mese non valido") throw new HttpError(400, error.message);
      throw error;
    }
  });

  app.patch("/payroll/:userId", write, async (request) => {
    const body = parseBody(payRateSchema, request.body);
    const id = tenantId(request);
    const userId = (request.params as { userId: string }).userId;
    const member = await must(prisma.membership.findFirst({ where: { tenantId: id, userId } }), "Dipendente");
    const hourly = body.hourlyRate != null && body.hourlyRate > 0 ? body.hourlyRate : null;
    await prisma.membership.update({
      where: { id: member.id },
      data: {
        hourlyRate: hourly,
        overtimeRate: hourly == null ? null : body.overtimeRate ?? hourly,
        weeklyHours: body.weeklyHours ?? 40,
      },
    });
    return syncPayrollMonth(id, body.month ?? currentMonth(), { replaceUserId: userId });
  });
}
