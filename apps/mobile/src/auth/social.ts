import * as AppleAuthentication from "expo-apple-authentication";
import { Platform, TurboModuleRegistry } from "react-native";

type GoogleModule = typeof import("@react-native-google-signin/google-signin");

/** Loaded only when the binary includes it: builds made before it was added (and Expo Go) crash on import. */
const google: GoogleModule | null = TurboModuleRegistry.get("RNGoogleSignin") ? require("@react-native-google-signin/google-signin") : null;

export type SocialProvider = "apple" | "google";

export interface SocialCredential {
  provider: SocialProvider;
  idToken: string;
  authorizationCode?: string;
  name?: string;
}

export class SocialCancelled extends Error {}

const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim();
const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();

/** iOS crashes without the URL scheme added by the build plugin, which exists only with the iOS client ID. */
export const GOOGLE_AVAILABLE =
  Boolean(google) && (Platform.OS === "ios" ? Boolean(googleIosClientId) : Platform.OS === "android" && Boolean(googleWebClientId));

if (GOOGLE_AVAILABLE) google!.GoogleSignin.configure({ iosClientId: googleIosClientId, webClientId: googleWebClientId });

export async function appleAvailable() {
  return Platform.OS === "ios" && (await AppleAuthentication.isAvailableAsync().catch(() => false));
}

export async function signInWithApple(): Promise<SocialCredential> {
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
    });
    if (!credential.identityToken) throw new Error("Apple non ha restituito le credenziali: riprova");
    const name = [credential.fullName?.givenName, credential.fullName?.familyName].filter(Boolean).join(" ");
    return { provider: "apple", idToken: credential.identityToken, authorizationCode: credential.authorizationCode ?? undefined, name: name || undefined };
  } catch (error) {
    if ((error as { code?: string }).code === "ERR_REQUEST_CANCELED") throw new SocialCancelled();
    throw error;
  }
}

export async function signInWithGoogle(): Promise<SocialCredential> {
  if (!google || !GOOGLE_AVAILABLE) throw new Error("Accesso con Google non disponibile in questa versione dell'app");
  const { GoogleSignin, isCancelledResponse, isErrorWithCode, statusCodes } = google;
  try {
    if (Platform.OS === "android") await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();
    if (isCancelledResponse(response)) throw new SocialCancelled();
    const { idToken, user } = response.data;
    if (!idToken) throw new Error("Google non ha restituito le credenziali: riprova");
    // Next time the account picker shows again, so another account can be chosen.
    await GoogleSignin.signOut().catch(() => undefined);
    return { provider: "google", idToken, name: user.name ?? undefined };
  } catch (error) {
    if (isErrorWithCode(error) && error.code === statusCodes.IN_PROGRESS) throw new SocialCancelled();
    if (isErrorWithCode(error) && error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) throw new Error("Servizi Google Play non disponibili su questo telefono");
    throw error;
  }
}
