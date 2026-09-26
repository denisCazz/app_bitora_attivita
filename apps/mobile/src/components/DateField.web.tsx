import { View } from "react-native";
import { Text, useTheme } from "@rapportini/ui";
import type { DateFieldProps } from "./DateField";

const INPUT_TYPE = { date: "date", datetime: "datetime-local", time: "time" } as const;

export type { DateFieldProps };

export function DateField({ label, value, onChange, mode = "date", error, minimumDate }: DateFieldProps) {
  const theme = useTheme();
  const min = minimumDate ? minimumDate.toISOString().slice(0, mode === "datetime" ? 16 : 10) : undefined;
  return (
    <View style={{ gap: 6 }}>
      <Text variant="label" muted>
        {label}
      </Text>
      <input
        type={INPUT_TYPE[mode]}
        aria-label={label}
        value={value}
        min={mode === "time" ? undefined : min}
        step={mode === "date" ? undefined : 300}
        onChange={(event) => onChange(event.currentTarget.value)}
        style={{
          minHeight: 54,
          borderRadius: theme.radius.md,
          border: `1px solid ${error ? theme.colors.danger : theme.colors.glassBorder}`,
          backgroundColor: theme.colors.field,
          color: theme.colors.ink,
          colorScheme: theme.dark ? "dark" : "light",
          padding: "0 16px",
          fontSize: 16,
          fontFamily: "inherit",
          boxSizing: "border-box",
          width: "100%",
        }}
      />
      {error ? (
        <Text variant="caption" style={{ color: theme.colors.danger }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
