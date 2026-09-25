function checkDigit(body: string): number {
  let sum = 0;
  for (let index = 0; index < body.length; index += 1) {
    const fromRight = body.length - index;
    sum += Number(body[index]) * (fromRight % 2 === 1 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

function compactCode(value: string): string {
  const cleaned = value.trim().replace(/[\u0000-\u001F]/g, "");
  const withoutAim = cleaned.replace(/^\][A-Za-z0-9]{2}/, "");
  return withoutAim.replace(/[\s-]/g, "");
}

export function barcodeKeys(value: string | null | undefined): string[] {
  const compact = compactCode(value ?? "");
  if (!compact) return [];
  const keys = new Set<string>([compact.toLowerCase()]);
  if (!/^\d+$/.test(compact)) return [...keys];

  const unpadded = compact.replace(/^0+/, "");
  if (unpadded) keys.add(unpadded);
  if (compact.length === 12) keys.add(`0${compact}`);
  if (compact.length === 13 && compact.startsWith("0")) keys.add(compact.slice(1));
  if (compact.length === 14 && checkDigit(compact.slice(0, 13)) === Number(compact[13])) {
    const body = compact.slice(1, 13);
    const ean = `${body}${checkDigit(body)}`;
    keys.add(ean);
    const unpaddedEan = ean.replace(/^0+/, "");
    if (unpaddedEan) keys.add(unpaddedEan);
  }
  return [...keys];
}

export function barcodesMatch(left: string | null | undefined, right: string | null | undefined): boolean {
  const keys = new Set(barcodeKeys(left));
  if (!keys.size) return false;
  return barcodeKeys(right).some((key) => keys.has(key));
}

export function matchesScannedCode(part: { sku: string; barcode?: string | null }, code: string): boolean {
  const needle = code.trim().toLowerCase();
  if (!needle) return false;
  if (part.sku.trim().toLowerCase() === needle) return true;
  return barcodesMatch(part.barcode, code);
}

export function matchesPartQuery(part: { name: string; sku: string; barcode?: string | null }, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  if (part.name.toLowerCase().includes(needle) || part.sku.toLowerCase().includes(needle)) return true;
  const barcode = (part.barcode ?? "").toLowerCase().replace(/[\s-]/g, "");
  if (barcode.includes(needle.replace(/[\s-]/g, ""))) return true;
  return barcodesMatch(part.barcode, query);
}
