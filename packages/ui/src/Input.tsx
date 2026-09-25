import { useState } from "react";
import { TextInput, View, type TextInputProps } from "react-native";
import { Text } from "./Text";
import { useTheme } from "./theme";

export function Input({ label, error, onFocus, onBlur, multiline, ...props }: TextInputProps & { label: string; error?: string }) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Text variant="label" muted>
        {label}
      </Text>
      <TextInput
        placeholderTextColor={theme.colors.inkSoft}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        multiline={multiline}
        {...props}
        style={{
          minHeight: multiline ? 120 : 54,
          borderRadius: theme.radius.md,
          borderWidth: focused ? 1.5 : 1,
          borderColor: error ? theme.colors.danger : focused ? theme.colors.accent : theme.colors.glassBorder,
          backgroundColor: theme.colors.field,
          color: theme.colors.ink,
          paddingHorizontal: 16,
          paddingVertical: multiline ? 12 : 0,
          textAlignVertical: multiline ? "top" : "center",
          fontSize: 16,
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
