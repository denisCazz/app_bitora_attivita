import type { ManifestModule, ModuleKey } from "@rapportini/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import { http } from "./api/client";
import { queryClient } from "./api/query";
import { IN_APP_PURCHASES, loadOffers, onStoreChange, purchase, STORE_NAME, syncPurchases, type StoreOffer } from "./iap";
import { useManifest } from "./session";

export function euro(cents: number) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
}

export function monthly(cents: number) {
  return `${euro(cents)}/mese`;
}

export function daysLeft(iso: string | null) {
  if (!iso) return 0;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
}

export function trialDate(days: number) {
  return formatDate(new Date(Date.now() + days * 86_400_000).toISOString());
}

async function refreshPlan() {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["manifest"] }),
    queryClient.invalidateQueries({ queryKey: ["modules"] }),
    queryClient.invalidateQueries({ queryKey: ["team"] }),
    queryClient.invalidateQueries({ queryKey: ["store-offers"] }),
  ]);
}

export interface CheckoutOutcome {
  status: "complete" | "processing" | "open" | "expired";
  kind: "modules" | "seats";
  moduleKeys: ModuleKey[];
  extraSeats: number | null;
  firstChargeAt: string | null;
}

export type CheckoutResult = CheckoutOutcome | { status: "cancelled" } | { status: "error"; message: string };

export type Notice = { tone: "success" | "danger" | "muted"; text: string };

export function checkoutNotice(result: CheckoutResult): Notice {
  switch (result.status) {
    case "complete":
      if (result.kind === "seats") return { tone: "success", text: "Pagamento riuscito: il posto in più è già disponibile." };
      return result.firstChargeAt
        ? { tone: "success", text: `Attivo. Oggi non hai pagato nulla: il primo addebito sarà il ${formatDate(result.firstChargeAt)}, alla fine della prova.` }
        : { tone: "success", text: "Pagamento riuscito: il modulo è attivo per tutta la tua attività." };
    case "processing":
      return { tone: "muted", text: "Pagamento in verifica: la banca lo sta confermando (di solito pochi minuti). Si attiva da solo appena arriva la conferma." };
    case "open":
      return { tone: "muted", text: "Pagamento non completato: nessun addebito." };
    case "expired":
      return { tone: "muted", text: "Pagamento scaduto: nessun addebito. Puoi riprovare." };
    case "cancelled":
      return { tone: "muted", text: "Pagamento annullato: nessun addebito." };
    case "error":
      return { tone: "danger", text: result.message };
  }
}

type StripeRedirect = { mode: "stripe"; url: string; sessionId: string };

const pendingCheckouts = new Set<string>();
const checkoutListeners = new Set<(result: CheckoutResult) => void>();
let billingPageOpen = false;

function notify(result: CheckoutResult) {
  for (const listener of checkoutListeners) listener(result);
}

/** The web build leaves for Stripe and comes back to the page it left; the apps open Stripe in an in-app browser. */
function webReturnUrl() {
  if (Platform.OS !== "web" || typeof window === "undefined") return undefined;
  return `${window.location.origin}${window.location.pathname}`;
}

async function confirmCheckout(sessionId: string) {
  const outcome = await http.post<CheckoutOutcome>("/billing/checkout/confirm", { sessionId });
  if (outcome.status !== "open") pendingCheckouts.delete(sessionId);
  await refreshPlan();
  return outcome;
}

/** Resolves with the outcome once the browser is closed; null while the payment page is still open (Android keeps it in Chrome). */
async function openCheckout(redirect: StripeRedirect): Promise<CheckoutOutcome | null> {
  if (Platform.OS === "web") {
    window.location.assign(redirect.url);
    return new Promise<never>(() => undefined);
  }
  pendingCheckouts.add(redirect.sessionId);
  const result = await WebBrowser.openBrowserAsync(redirect.url, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET });
  if (result.type === "opened") return null;
  return confirmCheckout(redirect.sessionId);
}

async function openBillingPage(url: string) {
  if (Platform.OS === "web") {
    window.location.assign(url);
    return new Promise<never>(() => undefined);
  }
  billingPageOpen = true;
  const result = await WebBrowser.openBrowserAsync(url, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET });
  if (result.type !== "opened") {
    billingPageOpen = false;
    await refreshPlan();
  }
}

/** Checks payments left open in the browser when the app comes back to the foreground. */
export function useCheckoutWatcher() {
  useEffect(() => {
    if (Platform.OS === "web") return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      if (billingPageOpen) {
        billingPageOpen = false;
        void refreshPlan();
      }
      for (const sessionId of [...pendingCheckouts]) {
        confirmCheckout(sessionId)
          .then((outcome) => outcome.status !== "open" && notify(outcome))
          .catch(() => undefined);
      }
    });
    return () => subscription.remove();
  }, []);
}

/** Reports payments finished outside the screen: back from Stripe on the web, or from Chrome on Android. */
export function useCheckoutResult(handler: (result: CheckoutResult) => void) {
  const router = useRouter();
  const params = useLocalSearchParams<{ checkout?: string; session_id?: string }>();
  const latest = useRef(handler);
  latest.current = handler;

  useEffect(() => {
    const listener = (result: CheckoutResult) => latest.current(result);
    checkoutListeners.add(listener);
    return () => {
      checkoutListeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (!params.checkout) return;
    const sessionId = params.session_id;
    router.setParams({ checkout: undefined, session_id: undefined });
    if (params.checkout !== "done" || !sessionId) {
      latest.current({ status: "cancelled" });
      return;
    }
    confirmCheckout(sessionId)
      .then((outcome) => latest.current(outcome))
      .catch((error: unknown) => latest.current({ status: "error", message: error instanceof Error ? error.message : "Verifica del pagamento non riuscita" }));
  }, [params.checkout, params.session_id, router]);
}

export function useStartTrial() {
  return useMutation({
    mutationFn: (moduleKey: ModuleKey) => http.post<{ trialEndsAt: string; started: Array<{ moduleKey: ModuleKey; trialEndsAt: string }> }>("/billing/trial", { moduleKey }),
    onSuccess: refreshPlan,
  });
}

export type SeatsResult = { mode: "demo" | "updated"; extraSeats: number } | { mode: "stripe"; outcome: CheckoutOutcome | null };

export function useUpdateSeats() {
  return useMutation({
    mutationFn: async (extraSeats: number): Promise<SeatsResult> => {
      const result = await http.post<{ mode: "demo" | "updated"; extraSeats: number } | StripeRedirect>("/billing/seats", { extraSeats, returnUrl: webReturnUrl() });
      if (result.mode !== "stripe") return result;
      return { mode: "stripe", outcome: await openCheckout(result) };
    },
    onSettled: refreshPlan,
  });
}

export function useBillingPortal() {
  return useMutation({
    mutationFn: async () => {
      const result = await http.post<{ url: string }>("/billing/portal", { returnUrl: webReturnUrl() });
      await openBillingPage(result.url);
    },
  });
}

/** App Store / Google Play prices for these modules, with the intro offer this account is really eligible for. */
export function useStoreOffers(modules: readonly ManifestModule[]) {
  const ids = modules
    .filter((module) => !module.free)
    .map((module) => module.storeProductId)
    .sort();
  return useQuery({
    queryKey: ["store-offers", ids],
    queryFn: () => loadOffers(ids),
    enabled: IN_APP_PURCHASES && ids.length > 0,
    staleTime: 10 * 60_000,
    retry: 1,
  });
}

export type BuyResult = { mode: "store" } | { mode: "demo" } | { mode: "stripe"; outcome: CheckoutOutcome | null };

/** Native apps sell through App Store / Google Play; the web build uses Stripe Checkout. */
export function useBuyModule() {
  return useMutation({
    mutationFn: async ({ module, offer }: { module: ManifestModule; offer?: StoreOffer | null }): Promise<BuyResult> => {
      if (!IN_APP_PURCHASES) {
        const result = await http.post<{ mode: "demo" } | StripeRedirect>("/billing/checkout", { moduleKeys: [module.key], returnUrl: webReturnUrl() });
        if (result.mode === "demo") return result;
        return { mode: "stripe", outcome: await openCheckout(result) };
      }
      if (!offer) throw new Error(`Prodotto non disponibile su ${STORE_NAME}`);
      const { accountToken } = await http.get<{ accountToken: string }>("/billing/store/account");
      await purchase(offer, accountToken);
      return { mode: "store" };
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

const SOURCE_NAME = { STRIPE: "carta", APPLE: "App Store", GOOGLE: "Google Play", DEMO: "demo" } as const;

/** One plain sentence on what this module costs and what happens next, for owned or trial modules. `price` is monthly, e.g. "9 €/mese". */
export function billingLine(module: ManifestModule, price: string): string | null {
  if (module.free) return null;
  if (module.status === "trial" && module.trialEndsAt) {
    return `Prova gratuita fino al ${formatDate(module.trialEndsAt)}. Poi si blocca da solo: nessun addebito, i dati restano salvati.`;
  }
  const source = module.billingSource;
  if (!source) return null;
  if (source === "DEMO") return "Incluso gratis nell'account demo: nessun addebito.";
  const stripeTrial = source === "STRIPE" && module.trialEndsAt && new Date(module.trialEndsAt) > new Date();
  if (module.renews === false && module.licenseExpiresAt) {
    return `Disdetto: resta attivo fino al ${formatDate(module.licenseExpiresAt)}, poi si blocca. Nessun altro addebito.`;
  }
  if (stripeTrial) return `${price} con ${SOURCE_NAME[source]}: il primo addebito sarà il ${formatDate(module.trialEndsAt!)}, alla fine della prova; poi ogni mese.`;
  if (source !== "STRIPE" && module.licenseExpiresAt) return `${price} con ${SOURCE_NAME[source]}: prossimo rinnovo il ${formatDate(module.licenseExpiresAt)}.`;
  return `${price} con ${SOURCE_NAME[source]}: si rinnova ogni mese finché non lo disdici.`;
}
