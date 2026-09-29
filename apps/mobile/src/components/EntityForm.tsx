import type { ResolvedField } from "@rapportini/shared";
import { View } from "react-native";
import { FieldRenderer } from "./FieldRenderer";

export function EntityForm({
  fields,
  values,
  onChange,
  includeBuiltIn = true,
}: {
  fields: ResolvedField[];
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
  includeBuiltIn?: boolean;
}) {
  const shown = fields.filter((field) => field.visible && (includeBuiltIn || !field.builtIn));
  if (!shown.length) return null;
  return (
    <View style={{ gap: 12 }}>
      {shown.map((field) => (
        <FieldRenderer
          key={`${field.entityKey}:${field.key}`}
          field={field}
          value={values[field.key] ?? ""}
          onChange={(next) => onChange({ ...values, [field.key]: next })}
        />
      ))}
    </View>
  );
}
