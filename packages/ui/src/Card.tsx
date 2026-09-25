import type { ViewProps } from "react-native";
import { Glass } from "./Glass";
import { useTheme } from "./theme";

export function Card({ style, ...props }: ViewProps) {
  const theme = useTheme();
  return <Glass {...props} style={[{ padding: theme.space.lg }, style]} />;
}
