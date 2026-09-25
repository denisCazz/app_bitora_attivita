import { Text as RNText, type TextProps, type TextStyle } from "react-native";
import { useTheme } from "./theme";

type Variant = "display" | "title" | "heading" | "body" | "label" | "caption";

export function Text({
  variant = "body",
  muted,
  style,
  ...props
}: TextProps & { variant?: Variant; muted?: boolean }) {
  const theme = useTheme();
  const variantStyle = theme.type[variant] as TextStyle;
  return (
    <RNText
      {...props}
      style={[{ color: muted ? theme.colors.inkSoft : theme.colors.ink }, variantStyle, style]}
    />
  );
}
