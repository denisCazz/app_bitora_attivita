import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { useState } from "react";
import { Platform, View } from "react-native";
import { Button, Pressy, Text, useTheme } from "@rapportini/ui";
import { defaultDate, describeDateValue, formatDateValue, parseDateValue, type DateMode } from "../dateValue";

export interface DateFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  mode?: DateMode;
  placeholder?: string;
  error?: string;
  clearable?: boolean;
  minimumDate?: Date;
}

export function DateField({ label, value, onChange, mode = "date", placeholder, error, clearable = true, minimumDate }: DateFieldProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const current = parseDateValue(value, mode) ?? defaultDate(mode);
  const shown = describeDateValue(value, mode);

  function pickAndroid() {
    const pickTime = (base: Date) =>
      DateTimePickerAndroid.open({
        value: base,
        mode: "time",
        is24Hour: true,
        onValueChange: (_event, time) => onChange(formatDateValue(time, mode)),
      });
    if (mode === "time") return pickTime(current);
    DateTimePickerAndroid.open({
      value: current,
      mode: "date",
      minimumDate,
      onValueChange: (_event, day) => {
        if (mode === "date") return onChange(formatDateValue(day, "date"));
        const next = new Date(day);
        next.setHours(current.getHours(), current.getMinutes(), 0, 0);
        pickTime(next);
      },
    });
  }

  function press() {
    if (Platform.OS === "android") pickAndroid();
    else {
      if (!value) onChange(formatDateValue(current, mode));
      setOpen((isOpen) => !isOpen);
    }
  }

  return (
    <View style={{ gap: 6 }}>
      <Text variant="label" muted>
        {label}
      </Text>
      <Pressy
        accessibilityRole="button"
        accessibilityLabel={shown ? `${label}: ${shown}` : label}
        scaleTo={0.99}
        onPress={press}
        style={{
          minHeight: 54,
          borderRadius: theme.radius.md,
          borderCurve: "continuous",
          borderWidth: open ? 1.5 : 1,
          borderColor: error ? theme.colors.danger : open ? theme.colors.accent : theme.colors.glassBorder,
          backgroundColor: theme.colors.field,
          paddingHorizontal: 16,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
        }}
      >
        <Ionicons name={mode === "time" ? "time-outline" : "calendar-outline"} size={18} color={theme.colors.accent} />
        <Text style={{ flex: 1, fontSize: 16, color: shown ? theme.colors.ink : theme.colors.inkSoft }}>{shown || placeholder || "Scegli"}</Text>
        {clearable && value ? (
          <Pressy
            accessibilityRole="button"
            accessibilityLabel={`Cancella ${label}`}
            hitSlop={10}
            onPress={() => {
              onChange("");
              setOpen(false);
            }}
          >
            <Ionicons name="close-circle" size={20} color={theme.colors.inkSoft} />
          </Pressy>
        ) : null}
      </Pressy>
      {open && Platform.OS === "ios" ? (
        <View style={{ gap: 8 }}>
          <DateTimePicker
            value={current}
            mode={mode}
            display={mode === "time" ? "spinner" : "inline"}
            locale="it-IT"
            minuteInterval={5}
            minimumDate={minimumDate}
            accentColor={theme.colors.accent}
            themeVariant={theme.dark ? "dark" : "light"}
            onValueChange={(_event, date) => onChange(formatDateValue(date, mode))}
          />
          <Button tone="soft" label="Fatto" onPress={() => setOpen(false)} />
        </View>
      ) : null}
      {error ? (
        <Text variant="caption" style={{ color: theme.colors.danger }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
