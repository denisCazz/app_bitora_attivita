import type { PresetSample } from "@rapportini/shared";

export interface SampleValueRow {
  fieldKey: string;
  textValue: string;
  numberValue: { toString(): string } | number | null;
  boolValue: boolean | null;
  refSample: string | null;
}

export interface SampleRow {
  categoryId: string;
  entityKey: string;
  ref: string;
  sortOrder: number;
  values: SampleValueRow[];
}

function text(row: SampleRow, key: string): string | undefined {
  const value = row.values.find((item) => item.fieldKey === key)?.textValue;
  return value ? value : undefined;
}

function num(row: SampleRow, key: string): number | undefined {
  const value = row.values.find((item) => item.fieldKey === key)?.numberValue;
  if (value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function many(row: SampleRow, key: string): SampleValueRow[] {
  return row.values.filter((item) => item.fieldKey === key);
}

function stockOf(row: SampleRow) {
  const rows = many(row, "stock")
    .map((item) => {
      const [location, quantity] = item.textValue.split("|");
      if (!location) return null;
      return { location, quantity: Number(quantity ?? item.numberValue ?? 0) };
    })
    .filter((item): item is { location: string; quantity: number } => Boolean(item));
  return rows.length ? rows : undefined;
}

/** Rebuilds the demo preset the shop bootstrap already knows how to insert. */
export function presetFromSamples(rows: readonly SampleRow[]): PresetSample | undefined {
  if (!rows.length) return undefined;
  const byEntity = (key: string) => rows.filter((row) => row.entityKey === key).sort((a, b) => a.sortOrder - b.sortOrder);
  const sample: PresetSample = {};
  const customer = byEntity("customer")[0];
  if (customer) {
    sample.customer = { name: text(customer, "name") ?? "Cliente", phone: text(customer, "phone"), city: text(customer, "city"), address: text(customer, "address") };
  }
  const locations = byEntity("stock_location");
  if (locations.length) {
    sample.stockLocations = locations.flatMap((row) => {
      const name = text(row, "name");
      const kind = text(row, "kind");
      if (!name || (kind !== "WAREHOUSE" && kind !== "MOBILE" && kind !== "POINT")) return [];
      return [{ name, kind }];
    });
  }
  const assets = byEntity("asset");
  if (assets.length) {
    sample.assets = assets.flatMap((row) => {
      const name = text(row, "name");
      if (!name) return [];
      const custom = Object.fromEntries(row.values.filter((item) => !["name", "type", "brand", "model", "serialNumber"].includes(item.fieldKey) && item.textValue).map((item) => [item.fieldKey, item.textValue]));
      return [{ name, type: text(row, "type"), brand: text(row, "brand"), model: text(row, "model"), serialNumber: text(row, "serialNumber"), ...(Object.keys(custom).length ? { customFields: custom } : {}) }];
    });
  }
  const parts = byEntity("product");
  if (parts.length) {
    sample.parts = parts.flatMap((row) => {
      const sku = text(row, "sku");
      const name = text(row, "name");
      if (!sku || !name) return [];
      const models = many(row, "compatibleModels").map((item) => item.textValue);
      return [{ sku, name, brand: text(row, "brand"), models: models.length ? models : undefined, barcode: text(row, "barcode"), price: num(row, "unitPrice"), stock: stockOf(row) }];
    });
  }
  const workOrder = byEntity("work_order")[0];
  if (workOrder && text(workOrder, "title")) sample.workOrder = text(workOrder, "title");
  const schedule = byEntity("schedule")[0];
  if (schedule && text(schedule, "title")) {
    sample.schedule = {
      title: text(schedule, "title")!,
      kind: text(schedule, "kind"),
      intervalMonths: num(schedule, "intervalMonths"),
      dueInDays: num(schedule, "dueInDays"),
    };
  }
  const tables = byEntity("dining_table");
  if (tables.length) {
    sample.tables = tables.flatMap((row) => {
      const name = text(row, "name");
      if (!name) return [];
      return [{ name, posX: num(row, "posX") ?? 0.1, posY: num(row, "posY") ?? 0.1, seats: num(row, "seats") ?? 2 }];
    });
  }
  const modifiers = byEntity("modifier");
  if (modifiers.length) sample.modifiers = modifiers.flatMap((row) => (text(row, "name") ? [{ name: text(row, "name")!, priceDelta: num(row, "priceDelta") }] : []));
  const ingredients = byEntity("ingredient");
  if (ingredients.length) {
    sample.ingredients = ingredients.flatMap((row) => {
      const name = text(row, "name");
      const unit = text(row, "unit");
      if (!name || !unit) return [];
      return [{ name, unit, sku: text(row, "sku"), category: text(row, "category"), min: num(row, "minQuantity"), cost: num(row, "unitCost"), stock: stockOf(row) }];
    });
  }
  const menu = byEntity("menu_item");
  if (menu.length) {
    sample.menu = menu.flatMap((row) => {
      const name = text(row, "name");
      const category = text(row, "category");
      if (!name || !category || num(row, "price") === undefined) return [];
      const mods = many(row, "modifiers").map((item) => item.textValue);
      return [{ name, category, station: text(row, "station"), price: num(row, "price")!, modifiers: mods.length ? mods : undefined }];
    });
  }
  const suppliers = byEntity("supplier");
  if (suppliers.length) {
    sample.suppliers = suppliers.flatMap((row) => {
      const name = text(row, "name");
      if (!name) return [];
      const lines = rows.filter((line) => line.entityKey === "purchase_line" && line.values.some((value) => value.fieldKey === "supplier" && value.refSample === row.ref));
      return [{
        name,
        phone: text(row, "phone"),
        email: text(row, "email"),
        order: lines.length
          ? lines.map((line) => ({
              ingredient: text(line, "ingredient"),
              description: text(line, "description") ?? "",
              quantity: num(line, "quantity") ?? 1,
              unitPrice: num(line, "unitPrice") ?? 0,
            }))
          : undefined,
      }];
    });
  }
  const shift = byEntity("shift")[0];
  if (shift && text(shift, "start") && text(shift, "end")) sample.shift = { roleLabel: text(shift, "roleLabel"), start: text(shift, "start")!, end: text(shift, "end")! };
  const order = byEntity("order")[0];
  const lines = byEntity("order_line");
  if (order && lines.length) {
    sample.order = {
      table: text(order, "table"),
      covers: num(order, "covers"),
      lines: lines.flatMap((line) => {
        const item = text(line, "item");
        if (!item) return [];
        const status = text(line, "status");
        return [{ item, quantity: num(line, "quantity"), status: status === "PENDING" || status === "SENT" || status === "READY" || status === "SERVED" ? status : undefined }];
      }),
    };
  }
  return Object.keys(sample).length ? sample : undefined;
}
