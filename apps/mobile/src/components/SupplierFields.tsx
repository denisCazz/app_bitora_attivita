import { Input } from "@rapportini/ui";
import type { SupplierDraft } from "../suppliers";

export function SupplierFields({
  draft,
  onChange,
  nameError,
}: {
  draft: SupplierDraft;
  onChange: (next: SupplierDraft) => void;
  nameError?: string;
}) {
  const set = (key: keyof SupplierDraft) => (value: string) => onChange({ ...draft, [key]: value });
  return (
    <>
      <Input label="Ragione sociale" value={draft.name} onChangeText={set("name")} error={nameError} />
      <Input label="Partita IVA" value={draft.vat} onChangeText={set("vat")} autoCapitalize="characters" />
      <Input label="Referente" value={draft.contactName} onChangeText={set("contactName")} />
      <Input label="Telefono" value={draft.phone} onChangeText={set("phone")} keyboardType="phone-pad" />
      <Input label="Email" value={draft.email} onChangeText={set("email")} keyboardType="email-address" autoCapitalize="none" />
      <Input label="Indirizzo" value={draft.address} onChangeText={set("address")} />
      <Input label="Città" value={draft.city} onChangeText={set("city")} />
      <Input label="Pagamento" value={draft.paymentTerms} onChangeText={set("paymentTerms")} placeholder="Bonifico a 30 giorni" />
      <Input label="Note" value={draft.notes} onChangeText={set("notes")} multiline />
    </>
  );
}
