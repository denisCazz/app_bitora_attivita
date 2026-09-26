import type { ManifestModule, ModuleKey } from "@rapportini/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";
import { useEffect } from "react";
import { http } from "./api/client";
import { queryClient } from "./api/query";
import { IN_APP_PURCHASES, loadOffer, onStoreChange, purchase, STORE_NAME, syncPurchases, type StoreOffer } from "./iap";
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

export function useUpdateSeats() {
  return useMutation({
    mutationFn: async (extraSeats: number) => {
      const result = await http.post<{ mode: "demo" | "updated"; extraSeats: number } | { mode: "stripe"; url: string }>("/billing/seats", { extraSeats });
      if (result.mode === "stripe") await WebBrowser.openBrowserAsync(result.url, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET });
      return result;
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["team"] });
      await refreshPlan();
    },
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

export function useBillingPortal() {
  return useMutation({
    mutationFn: async () => {
      const result = await http.post<{ url: string }>("/billing/portal");
      await WebBrowser.openBrowserAsync(result.url, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET });
      return result;
    },
    onSettled: refreshPlan,
  });
}

export function useStoreOffer(module: ManifestModule | undefined) {
  return useQuery({
    queryKey: ["store-offer", module?.storeProductId],
    queryFn: () => loadOffer(module!.storeProductId),
    enabled: IN_APP_PURCHASES && Boolean(module && !module.free),
    staleTime: 10 * 60_000,
    retry: 1,
  });
}

/** Native apps sell through App Store / Google Play; the web build uses Stripe Checkout. */
export function useBuyModule() {
  return useMutation({
    mutationFn: async ({ module, offer }: { module: ManifestModule; offer?: StoreOffer | null }) => {
      if (!IN_APP_PURCHASES) {
        const result = await http.post<{ mode: "demo" } | { mode: "stripe"; url: string }>("/billing/checkout", { moduleKeys: [module.key] });
        if (result.mode === "stripe") await WebBrowser.openBrowserAsync(result.url);
        return;
      }
      if (!offer) throw new Error(`Prodotto non disponibile su ${STORE_NAME}`);
      const { accountToken } = await http.get<{ accountToken: string }>("/billing/store/account");
      await purchase(offer, accountToken);
    },
    onSettled: refreshPlan,
  });
}

export function useRestorePurchases() {
  return useMutation({
    mutationFn: () => syncPurchases({ restore: true }),
    onSettled: refreshPlan,
  });
}

/** Picks up purchases finished while the app was closed (renewals, Ask to Buy, pending payments). */
export function useStoreSync(enabled: boolean) {
  useEffect(() => {
    if (!IN_APP_PURCHASES || !enabled) return;
    const stop = onStoreChange(() => void refreshPlan());
    syncPurchases()
      .then(({ restored }) => (restored ? refreshPlan() : undefined))
      .catch(() => undefined);
    return stop;
  }, [enabled]);
}

export function useLockedModules(): ManifestModule[] {
  const manifest = useManifest();
  return (manifest.data?.modules ?? []).filter((module) => module.status === "locked" || module.status === "trial").sort((a, b) => b.score - a.score);
}
