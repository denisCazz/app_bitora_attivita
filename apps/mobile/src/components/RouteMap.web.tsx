import { View, type StyleProp, type ViewStyle } from "react-native";
import { Text, useTheme } from "@rapportini/ui";
import type { Coords } from "../maps";

export interface MapStop {
  id: string;
  number: number;
  title: string;
  subtitle?: string;
  coords: Coords;
  done: boolean;
}

export const mapAvailable = false;

export function RouteMap({ style }: { stops: MapStop[]; showUser: boolean; onSelect?: (id: string) => void; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return (
    <View style={[{ alignItems: "center", justifyContent: "center", padding: theme.space.lg }, style]}>
      <Text muted style={{ textAlign: "center" }}>
        La mappa è disponibile nell'app per iPhone e Android. Da qui puoi comunque aprire le indicazioni su Google Maps.
      </Text>
    </View>
  );
}
