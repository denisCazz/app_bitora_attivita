import * as AppleAuthentication from "expo-apple-authentication";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { Pressy, Text } from "@rapportini/ui";
import { http } from "../api/client";
import { appleAvailable, GOOGLE_AVAILABLE, SocialCancelled, signInWithApple, signInWithGoogle, type SocialProvider } from "../auth/social";

export type SignInSession = {
  accessToken: string;
  refreshToken: string;
  needsOnboarding: boolean;
  activeTenantId: string | null;
  user: { platformAdmin: boolean };
};

const HEIGHT = 50;
const RADIUS = 12;

function GoogleLogo() {
  return (
    <Svg width={18} height={18} viewBox="0 0 48 48">
      <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </Svg>
  );
}

export function SocialButtons({
  mode,
  consents,
  onSession,
  onError,
}: {
  mode: "signin" | "signup";
  consents?: { acceptTerms: boolean; approveClauses: boolean };
  onSession: (session: SignInSession) => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const [apple, setApple] = useState(false);
  const [busy, setBusy] = useState<SocialProvider | null>(null);

  useEffect(() => {
    void appleAvailable().then(setApple);
  }, []);

  if (!apple && !GOOGLE_AVAILABLE) return null;

  async function run(provider: SocialProvider) {
    if (busy) return;
    setBusy(provider);
    onError(null);
    try {
      const credential = provider === "apple" ? await signInWithApple() : await signInWithGoogle();
      await onSession(await http.post<SignInSession>("/auth/social", { ...credential, ...consents }));
    } catch (error) {
      if (!(error instanceof SocialCancelled)) onError(error instanceof Error ? error.message : "Accesso non riuscito");
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={{ flex: 1, height: 1, backgroundColor: "rgba(255,255,255,0.2)" }} />
        <Text variant="caption" style={{ color: "rgba(255,255,255,0.6)" }}>
          oppure
        </Text>
        <View style={{ flex: 1, height: 1, backgroundColor: "rgba(255,255,255,0.2)" }} />
      </View>
      {apple ? (
        <View pointerEvents={busy ? "none" : "auto"} style={{ opacity: busy && busy !== "apple" ? 0.5 : 1 }}>
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={mode === "signup" ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP : AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
            cornerRadius={RADIUS}
            style={{ height: HEIGHT }}
            onPress={() => void run("apple")}
          />
        </View>
      ) : null}
      {GOOGLE_AVAILABLE ? (
        <Pressy
          accessibilityRole="button"
          disabled={busy !== null}
          onPress={() => void run("google")}
          style={{ borderRadius: RADIUS, opacity: busy && busy !== "google" ? 0.5 : 1 }}
        >
          <View style={{ height: HEIGHT, borderRadius: RADIUS, backgroundColor: "#fff", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 }}>
            {busy === "google" ? <ActivityIndicator color="#1F1F1F" /> : <GoogleLogo />}
            <Text style={{ color: "#1F1F1F", fontWeight: "600", fontSize: 17 }}>{mode === "signup" ? "Registrati con Google" : "Accedi con Google"}</Text>
          </View>
        </Pressy>
      ) : null}
    </View>
  );
}
