import type { ManifestModule, ModuleKey } from "@rapportini/shared";
import { useMutation } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";
import { http } from "./api/client";
import { queryClient } from "./api/query";
import { useManifest } from "./session";

export function monthly(cents: number) {
  const value = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
  return `${value}/mese`;
}

export function daysLeft(iso: string | null) {
  if (!iso) return 0;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

async function refreshPlan() {
  await queryClient.invalidateQueries({ queryKey: ["manifest"] });
  await queryClient.invalidateQueries({ queryKey: ["modules"] });
}

export function useStartTrial() {
  return useMutation({
    mutationFn: (moduleKey: ModuleKey) => http.post<{ trialEndsAt: string }>("/billing/trial", { moduleKey }),
    onSuccess: refreshPlan,
  });
}

export function useCheckout() {
  return useMutation({
    mutationFn: async (moduleKeys: ModuleKey[]) => {
      const result = await http.post<{ mode: "demo" } | { mode: "stripe"; url: string }>("/billing/checkout", { moduleKeys });
      if (result.mode === "stripe") await WebBrowser.openBrowserAsync(result.url, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET });
      return result;
    },
    onSettled: refreshPlan,
  });
}

export function useLockedModules(): ManifestModule[] {
  const manifest = useManifest();
  return (manifest.data?.modules ?? []).filter((module) => module.status === "locked" || module.status === "trial");
}
