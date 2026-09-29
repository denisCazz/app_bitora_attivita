import { Input } from "@rapportini/ui";
import { fieldText, useFields } from "../session";
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
  const fields = useFields("supplier");
  const set = (key: keyof SupplierDraft) => (value: string) => onChange({ ...draft, [key]: value });
  const label = (key: string, fallback: string) => fieldText(fields, key, fallback);
  const name = label("name", "Ragione sociale");
  const vat = label("vat", "Partita IVA");
  const contact = label("contactName", "Referente");
  const phone = label("phone", "Telefono");
  const email = label("email", "Email");
  const address = label("address", "Indirizzo");
  const city = label("city", "Città");
  const terms = label("paymentTerms", "Pagamento");
  const notes = label("notes", "Note");
  return (
    <>
      {name ? <Input label={name} value={draft.name} onChangeText={set("name")} error={nameError} /> : null}
      {vat ? <Input label={vat} value={draft.vat} onChangeText={set("vat")} autoCapitalize="characters" /> : null}
      {contact ? <Input label={contact} value={draft.contactName} onChangeText={set("contactName")} /> : null}
      {phone ? <Input label={phone} value={draft.phone} onChangeText={set("phone")} keyboardType="phone-pad" /> : null}
      {email ? <Input label={email} value={draft.email} onChangeText={set("email")} keyboardType="email-address" autoCapitalize="none" /> : null}
      {address ? <Input label={address} value={draft.address} onChangeText={set("address")} /> : null}
      {city ? <Input label={city} value={draft.city} onChangeText={set("city")} /> : null}
      {terms ? <Input label={terms} value={draft.paymentTerms} onChangeText={set("paymentTerms")} placeholder="Bonifico a 30 giorni" /> : null}
      {notes ? <Input label={notes} value={draft.notes} onChangeText={set("notes")} multiline /> : null}
    </>
  );
}
