import * as Notifications from "expo-notifications";
import * as WebBrowser from "expo-web-browser";
import { useQuery } from "@tanstack/react-query";
import { create } from "zustand";
import { api, clearQueue, http } from "./api/client";
import { persister, queryClient } from "./api/query";
import { forgetBiometric } from "./auth/biometric";
import { useAuth } from "./auth/store";

export interface Account {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  demo: boolean;
  hasPassword: boolean;
  signInWith: Array<"apple" | "google">;
  platformAdmin: boolean;
  activeTenantId: string | null;
  memberships: Array<{ tenantId: string; tenantName: string; roleName: string; owner: boolean }>;
  ownedTenants: Array<{ id: string; name: string; otherMembers: number }>;
  legalVersion: string;
  termsAcceptedAt: string | null;
  needsTerms: boolean;
  aiConsentAt: string | null;
}

export function useAccount() {
  const token = useAuth((state) => state.accessToken);
  return useQuery({ queryKey: ["account"], queryFn: () => http.get<Account>("/me"), enabled: Boolean(token) });
}

/** Demo accounts are shared, so their AI consent lives only in this app session. */
const useSessionAiConsent = create<{ granted: boolean }>(() => ({ granted: false }));

export function useAiConsent() {
  const account = useAccount();
  const session = useSessionAiConsent((state) => state.granted);
  return {
    loading: account.isLoading,
    granted: Boolean(account.data?.aiConsentAt) || (Boolean(account.data?.demo) && session),
    since: account.data?.aiConsentAt ?? null,
  };
}

export async function setAiConsent(granted: boolean) {
  await api("POST", "/me/ai-consent", { granted }, { force: true });
  useSessionAiConsent.setState({ granted });
  await queryClient.invalidateQueries({ queryKey: ["account"] });
}

export async function acceptTerms(version: string) {
  await api("POST", "/me/terms", { version, acceptTerms: true, approveClauses: true }, { force: true });
  await queryClient.invalidateQueries({ queryKey: ["account"] });
}

export async function downloadMyData() {
  const { url } = await api<{ url: string }>("POST", "/me/export-link", undefined, { force: true });
  await WebBrowser.openBrowserAsync(url);
}

async function devicePushToken(): Promise<string | undefined> {
  const settings = await Notifications.getPermissionsAsync().catch(() => null);
  if (!settings?.granted) return undefined;
  const token = await Notifications.getExpoPushTokenAsync().catch(() => null);
  return token?.data;
}

/** Drops every trace of the session on this device; `revoke` also ends it on the server. */
export async function signOut({ revoke = true }: { revoke?: boolean } = {}) {
  const refreshToken = useAuth.getState().refreshToken;
  if (revoke && refreshToken) {
    const pushToken = await devicePushToken();
    await api("POST", "/auth/logout", { refreshToken, pushToken }, { force: true }).catch(() => undefined);
  }
  await useAuth.getState().clear();
  await forgetBiometric();
  useSessionAiConsent.setState({ granted: false });
  await clearQueue();
  queryClient.clear();
  await persister.removeClient();
}
