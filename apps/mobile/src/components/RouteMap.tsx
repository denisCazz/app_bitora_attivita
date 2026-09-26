import { requireOptionalNativeModule } from "expo";
import Constants from "expo-constants";
import { Platform, View, type StyleProp, type ViewStyle } from "react-native";
import { Text, useTheme } from "@rapportini/ui";
import { cameraFor, type Coords } from "../maps";

export interface MapStop {
  id: string;
  number: number;
  title: string;
  subtitle?: string;
  coords: Coords;
  done: boolean;
}

// Expo Go non include ExpoMaps: importarlo lì manda in crash la schermata, serve una development build.
const maps: typeof import("expo-maps") | null = requireOptionalNativeModule("ExpoMaps") ? require("expo-maps") : null;

const hasGoogleKey = Boolean(Constants.expoConfig?.android?.config?.googleMaps?.apiKey);

export const mapAvailable = Boolean(maps) && (Platform.OS === "ios" || (Platform.OS === "android" && hasGoogleKey));

export function RouteMap({
  stops,
  showUser,
  onSelect,
  style,
}: {
  stops: MapStop[];
  showUser: boolean;
  onSelect?: (id: string) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const camera = cameraFor(stops.map((stop) => stop.coords));
  const path = stops.map((stop) => stop.coords);
  // La camera iniziale non segue i cambi di props: rimontiamo la mappa quando cambiano le tappe.
  const key = stops.map((stop) => stop.id).join("|");

  if (maps && Platform.OS === "ios") {
    const { AppleMaps } = maps;
    return (
      <AppleMaps.View
        key={key}
        style={style}
        cameraPosition={camera}
        markers={stops.map((stop) => ({
          id: stop.id,
          coordinates: stop.coords,
          title: stop.title,
          monogram: String(stop.number),
          tintColor: stop.done ? theme.colors.success : theme.colors.accent,
        }))}
        polylines={path.length > 1 ? [{ id: "route", coordinates: path, color: theme.colors.accent, width: 4 }] : []}
        properties={{ isMyLocationEnabled: showUser, pointsOfInterest: { including: [] } }}
        uiSettings={{ myLocationButtonEnabled: showUser, compassEnabled: true, scaleBarEnabled: false }}
        onMarkerClick={(marker) => marker.id && onSelect?.(marker.id)}
      />
    );
  }

  if (maps && Platform.OS === "android" && hasGoogleKey) {
    const { GoogleMaps } = maps;
    return (
      <GoogleMaps.View
        key={key}
        style={style}
        cameraPosition={camera}
        colorScheme={GoogleMaps.MapColorScheme.FOLLOW_SYSTEM}
        markers={stops.map((stop) => ({
          id: stop.id,
          coordinates: stop.coords,
          title: `${stop.number}. ${stop.title}`,
          snippet: stop.subtitle,
        }))}
        polylines={path.length > 1 ? [{ id: "route", coordinates: path, color: theme.colors.accent, width: 10 }] : []}
        properties={{ isMyLocationEnabled: showUser }}
        uiSettings={{ myLocationButtonEnabled: showUser, mapToolbarEnabled: false, zoomControlsEnabled: false }}
        onMarkerClick={(marker) => marker.id && onSelect?.(marker.id)}
      />
    );
  }

  return (
    <View style={[{ alignItems: "center", justifyContent: "center", padding: theme.space.lg }, style]}>
      <Text muted style={{ textAlign: "center" }}>
        {maps
          ? "La mappa non è disponibile su questo dispositivo. Le indicazioni stradali funzionano comunque."
          : "La mappa si vede solo nell'app installata, non in Expo Go. Le indicazioni stradali funzionano comunque."}
      </Text>
    </View>
  );
}
