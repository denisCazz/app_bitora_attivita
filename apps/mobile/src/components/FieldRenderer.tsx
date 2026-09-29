import type { ResolvedField } from "@rapportini/shared";
import { Pressable, View } from "react-native";
import { Input, Text, useTheme } from "@rapportini/ui";
import { DateField } from "./DateField";

export function FieldRenderer({
  field,
  value,
  onChange,
}: {
  field: Pick<ResolvedField, "key" | "label" | "type" | "placeholder" | "required" | "options">;
  value: string;
  onChange: (value: string) => void;
}) {
  const theme = useTheme();
  const label = field.required ? `${field.label} *` : field.label;
  if (field.type === "SELECT" || field.type === "MULTI_SELECT") {
    const chosen = new Set(value.split(",").map((item) => item.trim()).filter(Boolean));
    return (
      <View style={{ gap: 6 }}>
        <Text variant="label">{label}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {field.options.map((option) => {
            const selected = field.type === "MULTI_SELECT" ? chosen.has(option.value) : value === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => {
                  if (field.type !== "MULTI_SELECT") {
                    onChange(selected ? "" : option.value);
                    return;
                  }
                  if (selected) chosen.delete(option.value);
                  else chosen.add(option.value);
                  onChange([...chosen].join(","));
                }}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 999,
                  backgroundColor: selected ? theme.colors.accent : theme.colors.paperRaised,
                  borderWidth: 1,
                  borderColor: selected ? theme.colors.accent : theme.colors.line,
                }}
              >
                <Text style={{ color: selected ? "#fff" : theme.colors.ink }}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }
  if (field.type === "BOOLEAN") {
    const on = value === "true";
    return (
      <Pressable onPress={() => onChange(on ? "false" : "true")} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: on ? theme.colors.accent : theme.colors.paperRaised, borderWidth: 1, borderColor: theme.colors.line }} />
        <Text>{label}</Text>
      </Pressable>
    );
  }
  if (field.type === "DATE" || field.type === "DATETIME") {
    return <DateField label={label} value={value} onChange={onChange} />;
  }
  return (
    <Input
      label={label}
      value={value}
      multiline={field.type === "LONG_TEXT" || field.type === "SIGNATURE"}
      keyboardType={field.type === "NUMBER" || field.type === "MONEY" ? "decimal-pad" : "default"}
      placeholder={field.placeholder ?? (field.type === "PHOTO" ? "Link della foto" : "")}
      onChangeText={onChange}
    />
  );
}
