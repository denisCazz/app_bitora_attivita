import { z } from "zod";
import { MODULE_KEYS, STOCK_LOCATION_KINDS } from "./modules";
import { PERMISSIONS } from "./permissions";

export const moduleKeySchema = z.enum(MODULE_KEYS);
export const permissionSchema = z.enum(PERMISSIONS);
const dateTime = () => z.string().datetime({ offset: true });
const durationMinutes = () => z.number().int().min(5).max(720).optional().nullable().describe("Durata in minuti");
export const vocabKeySchema = z.string().trim().regex(/^[A-Z][A-Z0-9_]{1,39}$/, "Solo maiuscole, numeri e _");

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email(),
  password: z.string().min(8).max(80),
});

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export const demoLoginSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .refine((email) => email.toLowerCase().endsWith(".demo"), "Demo non disponibile"),
});

export const brandingSchema = z.object({
  accent: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  logoUrl: z.string().url().nullable().optional(),
});

export const terminologySchema = z.object({
  workOrder: z.string().trim().min(2).max(40).optional(),
  workOrders: z.string().trim().min(2).max(40).optional(),
  asset: z.string().trim().min(2).max(40).optional(),
  assets: z.string().trim().min(2).max(40).optional(),
  customer: z.string().trim().min(2).max(40).optional(),
  customers: z.string().trim().min(2).max(40).optional(),
  sparePart: z.string().trim().min(2).max(40).optional(),
  spareParts: z.string().trim().min(2).max(40).optional(),
  warehouse: z.string().trim().min(2).max(40).optional(),
  vehicle: z.string().trim().min(2).max(40).optional(),
});

const fieldKeySchema = z.string().trim().regex(/^[a-z][a-z0-9_]{0,39}$/);

export const activitySetupSchema = z.object({
  activity: z.string().trim().min(2).max(40),
  summary: z.string().trim().min(2).max(280),
  terminology: terminologySchema,
  assetTypes: z.array(z.string().trim().min(2).max(40)).max(8),
  customFields: z
    .array(
      z
        .object({
          entity: z.enum(["CUSTOMER", "ASSET", "WORK_ORDER", "PRODUCT"]),
          key: fieldKeySchema,
          label: z.string().trim().min(2).max(40),
          type: z.enum(["TEXT", "NUMBER", "DATE", "SELECT", "PHOTO"]),
          options: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
        })
        .superRefine((field, ctx) => {
          if (field.type === "SELECT" && (field.options?.length ?? 0) < 2) {
            ctx.addIssue({ code: "custom", message: "Un campo a scelta ha bisogno di almeno due opzioni" });
          }
        }),
    )
    .max(8),
  checklists: z
    .array(
      z.object({
        name: z.string().trim().min(2).max(60),
        kind: vocabKeySchema,
        items: z
          .array(z.object({ id: fieldKeySchema, label: z.string().trim().min(2).max(80) }))
          .min(1)
          .max(8),
      }),
    )
    .max(3),
  scheduleKinds: z
    .array(
      z.object({
        key: vocabKeySchema,
        label: z.string().trim().min(2).max(40),
        tone: z.enum(["accent", "warning", "success"]).optional(),
        minutes: z.number().int().min(5).max(720).optional(),
      }),
    )
    .max(6),
  stations: z
    .array(z.object({ key: vocabKeySchema, label: z.string().trim().min(2).max(40) }))
    .max(6),
  modules: z.array(moduleKeySchema).max(8),
});

export type ActivitySetup = z.infer<typeof activitySetupSchema>;

export const createTenantSchema = z.object({
  name: z.string().trim().min(2).max(80),
  categoryId: z.string().min(1),
  city: z.string().trim().max(80).optional(),
  withSample: z.boolean().optional(),
  needs: z.array(z.string().min(1).max(40)).max(20).optional(),
  trials: z.array(moduleKeySchema).max(MODULE_KEYS.length).optional(),
  setup: activitySetupSchema.optional(),
});

export const customFieldsSchema = z.record(z.string(), z.union([z.string(), z.number(), z.null()]));

export const customerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(40).optional().nullable(),
  email: z.string().trim().email().optional().nullable().or(z.literal("")),
  address: z.string().trim().max(160).optional().nullable(),
  city: z.string().trim().max(80).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  customFields: customFieldsSchema.optional(),
});

export const assetSchema = z.object({
  customerId: z.string().optional().nullable(),
  locationId: z.string().optional().nullable(),
  type: z.string().trim().max(80).optional().nullable(),
  name: z.string().trim().min(2).max(120),
  brand: z.string().trim().max(80).optional().nullable(),
  model: z.string().trim().max(80).optional().nullable(),
  serialNumber: z.string().trim().max(80).optional().nullable(),
  installedAt: dateTime().optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  customFields: customFieldsSchema.optional(),
});

export const workOrderSchema = z.object({
  customerId: z.string().optional().nullable(),
  assetId: z.string().optional().nullable(),
  assigneeId: z.string().optional().nullable(),
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(4000).optional().nullable(),
  status: z.enum(["DRAFT", "SCHEDULED", "IN_PROGRESS", "DONE", "CANCELLED"]).optional(),
  scheduledAt: dateTime().optional().nullable(),
  durationMinutes: durationMinutes(),
  customFields: customFieldsSchema.optional(),
});

export const signatureSchema = z.object({
  signedBy: z.string().trim().min(2).max(80),
  signatureData: z.string().min(2),
});

export const checklistTemplateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  kind: vocabKeySchema.optional(),
  items: z.array(z.object({ id: z.string(), label: z.string().trim().min(1).max(200) })).min(1),
});

export const checklistRunSchema = z
  .object({
    templateId: z.string().optional().nullable(),
    workOrderId: z.string().optional().nullable(),
    assetId: z.string().optional().nullable(),
    answers: z.array(z.object({ id: z.string().min(1).max(40), label: z.string().trim().max(200).optional(), checked: z.boolean(), note: z.string().max(4000).optional() })).min(1),
    completed: z.boolean().optional(),
  })
  .refine((value) => Boolean(value.templateId) || value.answers.some((answer) => answer.label?.trim() || answer.note?.trim()), {
    message: "Scegli un modello oppure scrivi il testo",
  });

export const scheduleSchema = z.object({
  assetId: z.string().optional().nullable(),
  templateId: z.string().optional().nullable(),
  kind: vocabKeySchema,
  title: z.string().trim().min(2).max(160),
  dueAt: dateTime(),
  durationMinutes: durationMinutes(),
  intervalMonths: z.number().int().min(1).max(60).optional().nullable(),
});

export const sparePartSchema = z.object({
  sku: z.string().trim().min(1).max(40),
  name: z.string().trim().min(2).max(160),
  brand: z.string().trim().max(80).optional().nullable(),
  compatibleModels: z.array(z.string().trim().min(1)).default([]),
  barcode: z.string().trim().max(80).optional().nullable(),
  unitPrice: z.number().min(0).default(0),
});

export const stockAdjustSchema = z.object({
  partId: z.string().optional().nullable(),
  ingredientId: z.string().optional().nullable(),
  locationId: z.string(),
  quantity: z.number(),
  reason: z.string().trim().max(200).optional(),
  workOrderId: z.string().optional().nullable(),
});

export const stockLocationSchema = z.object({
  name: z.string().trim().min(1).max(60),
  kind: z.enum(STOCK_LOCATION_KINDS),
});

export const stockTransferSchema = z.object({
  partId: z.string().optional().nullable(),
  ingredientId: z.string().optional().nullable(),
  fromLocationId: z.string().min(1),
  toLocationId: z.string().min(1),
  quantity: z.number().positive(),
  reason: z.string().trim().max(200).optional(),
});

export const tableSchema = z.object({
  name: z.string().trim().min(1).max(40),
  seats: z.number().int().min(1).max(30).optional(),
  posX: z.number().min(0).max(1).optional(),
  posY: z.number().min(0).max(1).optional(),
  locationId: z.string().optional().nullable(),
});

export const menuItemSchema = z.object({
  name: z.string().trim().min(2).max(120),
  category: z.string().trim().min(2).max(60),
  station: vocabKeySchema.optional(),
  price: z.number().min(0),
  available: z.boolean().optional(),
  modifierIds: z.array(z.string()).optional(),
  customFields: customFieldsSchema.optional(),
});

export const modifierSchema = z.object({
  name: z.string().trim().min(1).max(80),
  priceDelta: z.number().default(0),
});

export const orderLineSchema = z
  .object({
    menuItemId: z.string().optional().nullable(),
    name: z.string().trim().min(1).max(160).optional(),
    unitPrice: z.number().min(0).max(100_000).optional(),
    station: vocabKeySchema.optional(),
    quantity: z.number().int().min(1).max(50).default(1),
    modifierIds: z.array(z.string()).default([]),
    note: z.string().trim().max(200).optional().nullable(),
  })
  .refine((value) => Boolean(value.menuItemId) || Boolean(value.name?.trim()), { message: "Scegli dal menu oppure scrivi la voce" });

export const closeOrderSchema = z.object({
  payments: z.array(z.object({ label: z.string().min(1).max(40), amount: z.number().min(0) })).min(1),
});

export const ingredientSchema = z.object({
  name: z.string().trim().min(2).max(120),
  unit: z.string().trim().min(1).max(20),
  sku: z.string().trim().max(40).optional().nullable(),
});

export const recipeSchema = z.object({
  menuItemId: z.string(),
  lines: z.array(z.object({ ingredientId: z.string(), quantity: z.number().positive() })).min(1),
});

export const supplierSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().optional().nullable().or(z.literal("")),
  phone: z.string().trim().max(40).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export const purchaseOrderSchema = z.object({
  supplierId: z.string(),
  lines: z
    .array(
      z.object({
        ingredientId: z.string().optional().nullable(),
        description: z.string().trim().min(1).max(160),
        quantity: z.number().positive(),
        unitPrice: z.number().min(0),
      }),
    )
    .min(1),
});

export const shiftSchema = z.object({
  userId: z.string(),
  roleLabel: z.string().trim().max(40).optional().nullable(),
  startsAt: dateTime(),
  endsAt: dateTime(),
  status: z.enum(["PLANNED", "CONFIRMED", "DONE", "CANCELLED"]).optional(),
});

export const roleSchema = z.object({
  name: z.string().trim().min(2).max(40),
  permissions: z.array(permissionSchema).min(1),
});

export const customFieldDefSchema = z.object({
  entity: z.enum(["CUSTOMER", "ASSET", "WORK_ORDER", "PRODUCT"]),
  key: z.string().trim().regex(/^[a-z][a-z0-9_]{1,40}$/),
  label: z.string().trim().min(2).max(60),
  type: z.enum(["TEXT", "NUMBER", "DATE", "SELECT", "PHOTO"]),
  required: z.boolean().optional(),
  options: z.array(z.string().trim().min(1)).optional(),
});

export const inviteSchema = z.object({
  email: z.string().trim().email(),
  roleId: z.string(),
});

export const acceptInviteSchema = z.object({
  token: z.string().min(10),
  name: z.string().trim().min(2).max(80),
  password: z.string().min(8).max(80),
});

export const moduleToggleSchema = z.object({
  moduleKey: moduleKeySchema,
  enabled: z.boolean(),
});

export const trialSchema = z.object({ moduleKey: moduleKeySchema });

export const checkoutSchema = z.object({ moduleKeys: z.array(moduleKeySchema).min(1).max(MODULE_KEYS.length) });

export const seatsSchema = z.object({
  extraSeats: z.number().int().min(0).max(100),
});

export const memberRoleSchema = z.object({
  roleId: z.string().min(1),
});

const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
const slug = z.string().trim().regex(/^[a-z0-9_]{2,40}$/, "Solo minuscole, numeri e _");

const presetFieldSchema = z.object({
  entity: z.enum(["CUSTOMER", "ASSET", "WORK_ORDER", "PRODUCT"]),
  key: slug,
  label: z.string().trim().min(1).max(60),
  type: z.enum(["TEXT", "NUMBER", "DATE", "SELECT", "PHOTO"]),
  options: z.array(z.string().trim().min(1).max(60)).max(40).optional(),
});

const presetChecklistSchema = z.object({
  name: z.string().trim().min(2).max(80),
  kind: vocabKeySchema,
  items: z.array(z.object({ id: z.string().min(1).max(40), label: z.string().trim().min(1).max(120) })).min(1).max(60),
});

const vocabItemSchema = z.object({
  key: vocabKeySchema,
  label: z.string().trim().min(1).max(40),
  tone: z.enum(["accent", "warning", "success"]).optional(),
  minutes: z.number().int().min(5).max(720).optional(),
});

export const categoryPresetsSchema = z.object({
  assetTypes: z.array(z.string().trim().min(1).max(80)).max(40).optional(),
  customFields: z.array(presetFieldSchema).max(40).optional(),
  checklists: z.array(presetChecklistSchema).max(20).optional(),
  scheduleKinds: z.array(vocabItemSchema).max(20).optional(),
  stations: z.array(vocabItemSchema).max(20).optional(),
  dashboard: z.array(z.string().trim().min(2).max(40)).max(6).optional(),
  sample: z.record(z.string(), z.unknown()).optional(),
});

export const categorySchema = z.object({
  key: slug,
  parentId: z.string().nullable().optional(),
  label: z.string().trim().min(2).max(60),
  description: z.string().trim().max(200).optional(),
  icon: z.string().trim().min(2).max(60).optional(),
  accent: hexColor.nullable().optional(),
  image: z.string().trim().max(500).nullable().optional(),
  terminology: terminologySchema.optional(),
  presets: categoryPresetsSchema.optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
  active: z.boolean().optional(),
});

export const moduleDefSchema = z.object({
  label: z.string().trim().min(2).max(60).optional(),
  description: z.string().trim().max(200).optional(),
  pitch: z.string().trim().max(200).optional(),
  icon: z.string().trim().min(2).max(60).optional(),
  priceCents: z.number().int().min(0).max(100_000).optional(),
  trialDays: z.number().int().min(0).max(90).optional(),
  requires: z.array(moduleKeySchema).max(MODULE_KEYS.length).optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
  active: z.boolean().optional(),
});

export const categoryModuleSchema = z.object({
  moduleKey: moduleKeySchema,
  included: z.boolean().optional(),
  recommended: z.boolean().nullable().optional(),
  free: z.boolean().nullable().optional(),
  tab: z.boolean().nullable().optional(),
  sortOrder: z.number().int().min(0).max(999).nullable().optional(),
  label: z.string().trim().max(60).nullable().optional(),
  description: z.string().trim().max(200).nullable().optional(),
});

export const categoryRoleSchema = z.object({
  name: z.string().trim().min(2).max(40),
  owner: z.boolean().optional(),
  permissions: z.array(permissionSchema).max(PERMISSIONS.length),
  sortOrder: z.number().int().min(0).max(99).optional(),
});

export const needSchema = z.object({
  key: slug,
  categoryId: z.string().nullable().optional(),
  label: z.string().trim().min(2).max(80),
  description: z.string().trim().max(200).optional(),
  icon: z.string().trim().min(2).max(60).optional(),
  modules: z.array(moduleKeySchema).min(1).max(MODULE_KEYS.length),
  sortOrder: z.number().int().min(0).max(999).optional(),
  active: z.boolean().optional(),
});

export const needsSchema = z.object({ needs: z.array(z.string().min(1).max(40)).max(20) });

export const pushTokenSchema = z.object({
  token: z.string().min(8),
  platform: z.enum(["ios", "android", "web"]),
});
