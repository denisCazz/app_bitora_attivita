import type { CustomFieldDTO } from "@rapportini/shared";
import { View } from "react-native";
import { useFields } from "../session";
import { FieldRenderer } from "./FieldRenderer";

const ENTITY_KEY: Record<CustomFieldDTO["entity"], string> = {
  CUSTOMER: "customer",
  ASSET: "asset",
  WORK_ORDER: "work_order",
  PRODUCT: "menu_item",
};

export function CustomFields({
  entity,
  fields,
  values,
  onChange,
}: {
  entity: CustomFieldDTO["entity"];
  fields: CustomFieldDTO[];
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
}) {
  const resolved = useFields(ENTITY_KEY[entity]).filter((field) => field.visible && !field.builtIn);
  const fallback = fields
    .filter((field) => field.entity === entity)
    .map((field) => ({
      key: field.key,
      label: field.label,
      type: field.type,
      placeholder: null,
      required: field.required,
      options: field.options.map((option) => ({ value: option, label: option, sortOrder: 0 })),
    }));
  const shown = resolved.length ? resolved : fallback;
  if (!shown.length) return null;
  return (
    <View style={{ gap: 12 }}>
      {shown.map((field) => (
        <FieldRenderer key={field.key} field={field} value={values[field.key] ?? ""} onChange={(next) => onChange({ ...values, [field.key]: next })} />
      ))}
    </View>
  );
}
