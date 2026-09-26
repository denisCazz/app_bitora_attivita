import { requireOptionalNativeModule } from "expo";
import * as SecureStore from "expo-secure-store";
import { Alert, AppState, Platform } from "react-native";
import { create } from "zustand";

type LocalAuthenticationModule = typeof import("expo-local-authentication");

/** Loaded only when the binary includes it, so older development builds keep working without the lock. */
const LocalAuthentication: LocalAuthenticationModule | null = requireOptionalNativeModule("ExpoLocalAuthentication")
  ? require("expo-local-authentication")
  : null;

const ENABLED = "rapportini.biometric";
const OFFERED = "rapportini.biometric.offered";
/** Short trips to another app (camera, maps, a phone call) do not lock again. */
const RELOCK_AFTER_MS = 60_000;

interface LockState {
  ready: boolean;
  enabled: boolean;
  locked: boolean;
}

export const useBiometricLock = create<LockState>(() => ({ ready: false, enabled: false, locked: false }));

/** "Face ID", "Touch ID"… or null when the device has no enrolled biometrics. */
export async function biometricLabel(): Promise<string | null> {
  if (!LocalAuthentication) return null;
  try {
    const [hardware, enrolled] = await Promise.all([LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync()]);
    if (!hardware || !enrolled) return null;
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return Platform.OS === "ios" ? "Face ID" : "il volto";
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return Platform.OS === "ios" ? "Touch ID" : "l'impronta";
    return "la biometria";
  } catch {
    return null;
  }
}

export async function hydrateBiometric(hasSession: boolean) {
  const enabled = Boolean(LocalAuthentication) && (await SecureStore.getItemAsync(ENABLED).catch(() => null)) === "1";
  useBiometricLock.setState({ ready: true, enabled, locked: enabled && hasSession });
}

export function watchAppState() {
  let backgroundAt: number | null = null;
  const subscription = AppState.addEventListener("change", (state) => {
    if (state === "background") backgroundAt = Date.now();
    if (state !== "active" || backgroundAt === null) return;
    if (useBiometricLock.getState().enabled && Date.now() - backgroundAt > RELOCK_AFTER_MS) useBiometricLock.setState({ locked: true });
    backgroundAt = null;
  });
  return () => subscription.remove();
}

async function authenticate(promptMessage: string) {
  if (!LocalAuthentication) return false;
  const result = await LocalAuthentication.authenticateAsync({ promptMessage, cancelLabel: "Annulla" }).catch(() => null);
  return Boolean(result?.success);
}

export async function unlock() {
  if (await authenticate("Sblocca Bitora")) useBiometricLock.setState({ locked: false });
}

export async function setBiometricEnabled(enabled: boolean): Promise<boolean> {
  if (enabled && !(await authenticate("Attiva lo sblocco di Bitora"))) return false;
  await SecureStore.setItemAsync(ENABLED, enabled ? "1" : "0");
  useBiometricLock.setState({ enabled, locked: false });
  return true;
}

/** The next person signing in on this phone chooses for themselves. */
export async function forgetBiometric() {
  await Promise.all([SecureStore.deleteItemAsync(ENABLED), SecureStore.deleteItemAsync(OFFERED)]).catch(() => undefined);
  useBiometricLock.setState({ enabled: false, locked: false });
}

/** Asked once, right after signing in. */
export async function offerBiometric() {
  if (useBiometricLock.getState().enabled || (await SecureStore.getItemAsync(OFFERED).catch(() => null))) return;
  const label = await biometricLabel();
  if (!label) return;
  await SecureStore.setItemAsync(OFFERED, "1");
  Alert.alert(`Sbloccare Bitora con ${label}?`, "Quando apri l'app ti chiediamo il riconoscimento, così schede e dati dei clienti restano protetti anche se lasci il telefono incustodito.", [
    { text: "Non ora", style: "cancel" },
    { text: "Attiva", onPress: () => void setBiometricEnabled(true) },
  ]);
}
