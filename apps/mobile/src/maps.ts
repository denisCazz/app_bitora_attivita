import { useQueries } from "@tanstack/react-query";
import * as Location from "expo-location";
import { useCallback, useEffect, useState } from "react";
import { Alert, Linking, Platform } from "react-native";

export interface Coords {
  latitude: number;
  longitude: number;
}

interface Addressable {
  address?: string | null;
  city?: string | null;
}

export function addressLine(place?: Addressable | null) {
  if (!place) return null;
  const text = [place.address, place.city].map((part) => part?.trim()).filter(Boolean).join(", ");
  return text || null;
}

type Provider = "apple" | "google" | "waze";

const PROVIDER_LABEL: Record<Provider, string> = { apple: "Mappe di Apple", google: "Google Maps", waze: "Waze" };

/** Google Maps apre al massimo 9 tappe intermedie più la destinazione. */
const GOOGLE_MAX_STOPS = 10;

function query(params: Array<[string, string]>) {
  return params.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join("&");
}

function directionsUrl(provider: Provider, stops: string[]) {
  const destination = stops[stops.length - 1]!;
  const waypoints = stops.slice(0, -1);
  if (provider === "apple") {
    return `https://maps.apple.com/directions?${query([...waypoints.map((stop) => ["waypoint", stop] as [string, string]), ["destination", destination], ["mode", "driving"]])}`;
  }
  if (provider === "google") {
    const params: Array<[string, string]> = [["api", "1"], ["destination", destination], ["travelmode", "driving"]];
    if (waypoints.length) params.push(["waypoints", waypoints.join("|")]);
    return `https://www.google.com/maps/dir/?${query(params)}`;
  }
  return `https://waze.com/ul?${query([["q", destination], ["navigate", "yes"]])}`;
}

function providersFor(stopCount: number): Provider[] {
  const multi = stopCount > 1;
  if (Platform.OS === "ios") return multi ? ["apple", "google"] : ["apple", "google", "waze"];
  if (Platform.OS === "android") return multi ? ["google"] : ["google", "waze"];
  return ["google"];
}

async function launch(provider: Provider, stops: string[]) {
  const capped = provider === "google" ? stops.slice(0, GOOGLE_MAX_STOPS) : stops;
  try {
    await Linking.openURL(directionsUrl(provider, capped));
  } catch {
    Alert.alert("Impossibile aprire le mappe", `Non riesco ad aprire ${PROVIDER_LABEL[provider]} su questo dispositivo.`);
    return;
  }
  if (capped.length < stops.length) {
    Alert.alert("Percorso accorciato", `Google Maps accetta al massimo ${GOOGLE_MAX_STOPS} tappe: ho aperto le prime ${GOOGLE_MAX_STOPS}.`);
  }
}

/** Indicazioni stradali dalla posizione attuale attraverso le tappe, nell'ordine dato. */
export function openDirections(stops: string[], title?: string) {
  if (!stops.length) return;
  const providers = providersFor(stops.length);
  if (providers.length === 1) {
    void launch(providers[0]!, stops);
    return;
  }
  Alert.alert(title ?? (stops.length > 1 ? `Percorso con ${stops.length} tappe` : "Indicazioni stradali"), "Con quale app vuoi navigare?", [
    ...providers.map((provider) => ({ text: PROVIDER_LABEL[provider], onPress: () => void launch(provider, stops) })),
    { text: "Annulla", style: "cancel" as const },
  ]);
}

export const geocodingSupported = Platform.OS === "ios" || Platform.OS === "android";

/** Android geocodifica solo con il permesso posizione; iOS no, ma serve per mostrare il punto blu. */
export function useLocationAccess() {
  const [granted, setGranted] = useState<boolean | null>(geocodingSupported ? null : false);
  useEffect(() => {
    if (!geocodingSupported) return;
    Location.getForegroundPermissionsAsync()
      .then((status) => setGranted(status.granted))
      .catch(() => setGranted(false));
  }, []);
  const request = useCallback(async () => {
    if (!geocodingSupported) return false;
    try {
      const status = await Location.requestForegroundPermissionsAsync();
      setGranted(status.granted);
      return status.granted;
    } catch {
      setGranted(false);
      return false;
    }
  }, []);
  return { granted, request, canGeocode: Platform.OS === "ios" || granted === true };
}

// Il geocoder di sistema sopporta male le richieste in parallelo: le mettiamo in fila.
let geocodeChain: Promise<unknown> = Promise.resolve();

function geocode(address: string): Promise<Coords | null> {
  const run = geocodeChain.then(async () => {
    const [hit] = await Location.geocodeAsync(address);
    return hit ? { latitude: hit.latitude, longitude: hit.longitude } : null;
  });
  geocodeChain = run.catch(() => undefined);
  return run;
}

/** Coordinate per indirizzo. Con `enabled` falso legge solo quelle già in cache. */
export function useGeocoded(addresses: string[], enabled: boolean) {
  const unique = [...new Set(addresses)];
  const results = useQueries({
    queries: unique.map((address) => ({
      queryKey: ["geocode", address],
      queryFn: () => geocode(address),
      enabled: enabled && geocodingSupported,
      staleTime: Infinity,
      gcTime: 1000 * 60 * 60 * 24,
      retry: 1,
    })),
  });
  const coords = new Map<string, Coords | null>();
  unique.forEach((address, index) => {
    const data = results[index]?.data;
    if (data !== undefined) coords.set(address, data);
  });
  return { coords, loading: results.some((result) => result.isFetching) };
}

function haversineKm(a: Coords, b: Coords) {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

export interface LegEstimate {
  km: number;
  minutes: number;
}

/** Stima grezza in linea d'aria corretta per le strade: indicativa, non sostituisce il navigatore. */
export function estimateLeg(a: Coords, b: Coords): LegEstimate {
  const km = haversineKm(a, b) * 1.3;
  return { km, minutes: Math.round((km / 45) * 60) + (km > 0.3 ? 3 : 0) };
}

export function formatDistance(km: number) {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km < 10 ? km.toFixed(1).replace(".", ",") : Math.round(km)} km`;
}

export function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${String(rest).padStart(2, "0")}` : `${hours} h`;
}

export function cameraFor(points: Coords[]) {
  if (!points.length) return { coordinates: { latitude: 42.5, longitude: 12.5 }, zoom: 5 };
  const lats = points.map((point) => point.latitude);
  const lngs = points.map((point) => point.longitude);
  const [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  const latitude = (minLat + maxLat) / 2;
  const longitude = (minLng + maxLng) / 2;
  const span = Math.max(maxLat - minLat, (maxLng - minLng) * Math.cos((latitude * Math.PI) / 180), 0.01) * 1.8;
  return { coordinates: { latitude, longitude }, zoom: Math.min(15, Math.max(3, Math.log2(360 / span))) };
}
