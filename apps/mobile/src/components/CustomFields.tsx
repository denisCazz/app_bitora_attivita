import type { CustomFieldDTO } from "@rapportini/shared";
import { Pressable, View } from "react-native";
import { Input, Text, useTheme } from "@rapportini/ui";
import { DateField } from "./DateField";

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
  const theme = useTheme();
  const relevant = fields.filter((field) => field.entity === entity);
  if (!relevant.length) return null;
  return (
    <View style={{ gap: 12 }}>
      {relevant.map((field) =>
        field.type === "SELECT" ? (
          <View key={field.id} style={{ gap: 6 }}>
            <Text variant="label">{field.label}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {field.options.map((option) => {
                const selected = values[field.key] === option;
                return (
                  <Pressable
                    key={option}
                    onPress={() => onChange({ ...values, [field.key]: option })}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 999,
                      backgroundColor: selected ? theme.colors.accent : theme.colors.paperRaised,
                      borderWidth: 1,
                      borderColor: selected ? theme.colors.accent : theme.colors.line,
                    }}
                  >
                    <Text style={{ color: selected ? "#fff" : theme.colors.ink }}>{option}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : field.type === "DATE" ? (
          <DateField key={field.id} label={field.label} value={values[field.key] ?? ""} onChange={(text) => onChange({ ...values, [field.key]: text })} />
        ) : (
          <Input
            key={field.id}
            label={field.label}
            value={values[field.key] ?? ""}
            keyboardType={field.type === "NUMBER" ? "decimal-pad" : "default"}
            placeholder={field.type === "PHOTO" ? "Link della foto" : ""}
            onChangeText={(text) => onChange({ ...values, [field.key]: text })}
          />
        ),
      )}
    </View>
  );
}
