import type { Manifest, ManifestModule, NeedView } from "@rapportini/shared";
import { Ionicons } from "@expo/vector-icons";
import { useMutation } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Badge, Button, Card, Glass, Pressy, Screen, Text, useTheme } from "@rapportini/ui";
import { http } from "../../../src/api/client";
import { queryClient } from "../../../src/api/query";
import { billingLine, checkoutNotice, daysLeft, euro, formatDate, monthly, useBillingPortal, useCheckoutResult, useRestorePurchases, useStoreOffers } from "../../../src/billing";
import { Chip } from "../../../src/components/Chip";
import { ModuleIcon } from "../../../src/components/ModuleIcon";
import { IN_APP_PURCHASES, manageSubscriptions, STORE_NAME, type StoreOffer } from "../../../src/iap";
import { can, useManifest } from "../../../src/session";

function priceOf(module: ManifestModule, offers: Record<string, StoreOffer> | undefined) {
  const offer = offers?.[module.storeProductId];
  return IN_APP_PURCHASES && offer ? `${offer.displayPrice}/mese` : monthly(module.priceCents);
}

function Offer({ module, highlighted, price, storeTrial }: { module: ManifestModule; highlighted: boolean; price: string; storeTrial: string | null }) {
  const theme = useTheme();
  const router = useRouter();
  const inTrial = module.status === "trial";
  const trialUsed = Boolean(module.trialEndsAt) && !inTrial;
  const open = () => router.push({ pathname: "/(app)/store/[key]", params: { key: module.key } });

  return (
    <Pressy onPress={open} style={{ borderRadius: theme.radius.lg }}>
      <Card style={{ gap: 12, borderColor: highlighted ? theme.colors.accent : theme.colors.glassBorder, borderWidth: highlighted ? 1.5 : 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <ModuleIcon name={module.icon} active={inTrial} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="heading">{module.label}</Text>
            <Text variant="caption" muted>
              {module.pitch}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.inkSoft} />
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <Text variant="heading">{price}</Text>
          {inTrial ? (
            <Badge tone="accent" label={`In prova · ${daysLeft(module.trialEndsAt)} giorni`} />
          ) : trialUsed ? (
            <Badge label="Prova già usata" />
          ) : module.trialDays > 0 ? (
            <Badge tone="success" label={`Prova gratis ${module.trialDays} giorni, senza carta`} />
          ) : storeTrial ? (
            <Badge tone="success" label={`${storeTrial} gratis`} />
          ) : null}
        </View>
        {inTrial && module.trialEndsAt ? (
          <Text variant="caption" muted>
            {`Fino al ${formatDate(module.trialEndsAt)}, poi si blocca da solo: nessun addebito.`}
          </Text>
        ) : null}
        <Button tone="secondary" label="Scopri cosa fa" onPress={open} />
      </Card>
    </Pressy>
  );
}

function NeedsCard({ needs, chosen }: { needs: NeedView[]; chosen: string[] }) {
  const save = useMutation({
    mutationFn: (next: string[]) => http.patch("/settings/needs", { needs: next }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["manifest"] }),
  });
  return (
    <Card style={{ gap: 10 }}>
      <Text variant="heading">Cosa ti serve?</Text>
      <Text variant="caption" muted>
        Scegli e ti mettiamo in cima i moduli giusti.
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {needs.map((need) => (
          <Chip
            key={need.key}
            label={need.label}
            active={chosen.includes(need.key)}
            onPress={() => save.mutate(chosen.includes(need.key) ? chosen.filter((key) => key !== need.key) : [...chosen, need.key])}
          />
        ))}
      </View>
    </Card>
  );
}

function SummaryRow({ icon, title, detail, amount }: { icon: string; title: string; detail: string | null; amount: string }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
      <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={18} color={theme.colors.accent} style={{ marginTop: 2 }} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontWeight: "700" }}>{title}</Text>
        {detail ? (
          <Text variant="caption" muted>
            {detail}
          </Text>
        ) : null}
      </View>
      <Text style={{ fontWeight: "700" }}>{amount}</Text>
    </View>
  );
}

/** Every line that costs money or is about to, with the date that matters for each one. */
function PlanSummary({ manifest, offers }: { manifest: Manifest; offers: Record<string, StoreOffer> | undefined }) {
  const theme = useTheme();
  const paid = manifest.modules.filter((module) => !module.free && module.billingSource && (module.status === "active" || module.status === "off"));
  const trials = manifest.modules.filter((module) => module.status === "trial");
  const seats = manifest.plan.seats;
  if (!paid.length && !trials.length && !seats.extra) return null;
  const storeBilled = paid.some((module) => module.billingSource === "APPLE" || module.billingSource === "GOOGLE");
  return (
    <Card style={{ gap: 12 }}>
      <Text variant="heading">Cosa paghi</Text>
      {paid.map((module) => (
        <SummaryRow
          key={module.key}
          icon={module.icon}
          title={module.label}
          detail={billingLine(module, priceOf(module, offers))}
          amount={module.billingSource === "DEMO" ? "0 €" : priceOf(module, offers)}
        />
      ))}
      {trials.map((module) => (
        <SummaryRow key={module.key} icon={module.icon} title={`${module.label} · in prova`} detail={billingLine(module, priceOf(module, offers))} amount="0 €" />
      ))}
      {seats.extra ? (
        <SummaryRow
          icon="people-outline"
          title={`${seats.extra} ${seats.extra === 1 ? "utente extra" : "utenti extra"}`}
          detail={`${seats.included} utenti sono inclusi gratis; ogni utente in più costa ${monthly(seats.priceCents)}, con carta.`}
          amount={monthly(seats.priceCents * seats.extra)}
        />
      ) : null}
      <View style={{ height: 1, backgroundColor: theme.colors.line }} />
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text variant="heading">Totale al mese</Text>
        <Text variant="heading">{euro(manifest.plan.monthlyCents)}</Text>
      </View>
      <Text variant="caption" muted>
        {`Le prove non costano nulla e non si rinnovano da sole.${storeBilled ? ` Per gli abbonamenti ${STORE_NAME} vale il prezzo indicato dallo store.` : ""}`}
      </Text>
    </Card>
  );
}

export default function StoreScreen() {
  const router = useRouter();
  const theme = useTheme();
  const manifest = useManifest();
  const params = useLocalSearchParams<{ module?: string }>();
  const portal = useBillingPortal();
  const restore = useRestorePurchases();
  const [message, setMessage] = useState("");
  useCheckoutResult((result) => setMessage(checkoutNotice(result).text));
  const modules = manifest.data?.modules ?? [];
  const offers = useStoreOffers(modules);
  const canBuy = can(manifest.data, "settings.manage");
  const included = modules.filter((module) => module.free);
  const owned = modules.filter((module) => !module.free && (module.status === "active" || module.status === "off"));
  const available = modules
    .filter((module) => module.status === "locked" || module.status === "trial")
    .sort((a, b) => Number(b.key === params.module) - Number(a.key === params.module) || b.score - a.score);
  const suggested = available.filter((module) => module.recommended || module.key === params.module || module.status === "trial");
  const others = available.filter((module) => !suggested.includes(module));
  const plan = manifest.data?.plan;
  const stripeManaged = owned.some((module) => module.billingSource === "STRIPE");
  const storeManaged = owned.some((module) => module.billingSource === "APPLE" || module.billingSource === "GOOGLE");

  function run(action: Promise<unknown>) {
    setMessage("");
    action.catch((caught: Error) => setMessage(caught.message));
  }

  function restorePurchases() {
    setMessage("");
    restore.mutate(undefined, {
      onSuccess: ({ restored }) => setMessage(restored ? `Abbonamenti ripristinati: ${restored}.` : `Nessun abbonamento attivo trovato su ${STORE_NAME}.`),
      onError: (caught: Error) => setMessage(caught.message),
    });
  }

  function offerCard(module: ManifestModule, highlighted: boolean) {
    return <Offer key={module.key} module={module} highlighted={highlighted} price={priceOf(module, offers.data)} storeTrial={offers.data?.[module.storeProductId]?.freeTrial ?? null} />;
  }

  return (
    <Screen onBack={() => router.back()}>
      <View style={{ gap: 4 }}>
        <Text variant="caption" muted>
          Il tuo piano
        </Text>
        <Text variant="display">{plan?.paidModules ? "Base + moduli" : "Base"}</Text>
        <Text muted>
          {plan && (plan.paidModules > 0 || plan.seats.extra > 0)
            ? `${[plan.paidModules ? `${plan.paidModules} moduli` : null, plan.seats.extra ? `${plan.seats.extra} ${plan.seats.extra === 1 ? "utente extra" : "utenti extra"}` : null].filter(Boolean).join(" · ")} · ${monthly(plan.monthlyCents)}`
            : "Gratis, per sempre. 3 utenti inclusi. Aggiungi solo quello che usi."}
        </Text>
        {canBuy && IN_APP_PURCHASES && storeManaged ? (
          <Button tone="secondary" label={`Gestisci abbonamenti su ${STORE_NAME}`} onPress={() => run(manageSubscriptions())} />
        ) : null}
        {canBuy && !IN_APP_PURCHASES && (stripeManaged || (plan?.seats.extra ?? 0) > 0) ? (
          <Button tone="secondary" label="Gestisci abbonamento e fatture" loading={portal.isPending} onPress={() => run(portal.mutateAsync())} />
        ) : null}
        {canBuy && IN_APP_PURCHASES && stripeManaged ? (
          <Text variant="caption" muted>
            Alcuni moduli sono stati attivati dal sito web: li gestisci da lì.
          </Text>
        ) : null}
        {message ? (
          <Text variant="caption" muted>
            {message}
          </Text>
        ) : null}
      </View>

      {manifest.data ? <PlanSummary manifest={manifest.data} offers={offers.data} /> : null}

      <Glass rounded={28} style={{ padding: 18, gap: 12 }}>
        <LinearGradient colors={[theme.colors.accentSoft, "transparent"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Ionicons name="sparkles" size={18} color={theme.colors.accent} />
          <Text variant="heading">Incluso nel tuo piano</Text>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {[...included, ...owned].map((module) => (
            <View key={module.key} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 99, backgroundColor: theme.colors.field, borderWidth: 1, borderColor: theme.colors.glassBorder }}>
              <Ionicons name={module.icon as keyof typeof Ionicons.glyphMap} size={14} color={theme.colors.accent} />
              <Text variant="caption" style={{ fontWeight: "700" }}>
                {module.label}
              </Text>
            </View>
          ))}
        </View>
      </Glass>

      {canBuy && manifest.data?.needs.length ? <NeedsCard needs={manifest.data.needs} chosen={manifest.data.tenant.needs} /> : null}

      {available.length ? null : <Text muted>Hai già tutti i moduli.</Text>}
      {suggested.length ? <Text variant="title">Consigliati per te</Text> : null}
      {suggested.map((module) => offerCard(module, module.key === params.module))}

      {others.length ? <Text variant="title">Altri moduli</Text> : null}
      {others.map((module) => offerCard(module, false))}

      {canBuy && IN_APP_PURCHASES ? <Button tone="ghost" label="Ripristina acquisti" loading={restore.isPending} onPress={restorePurchases} /> : null}
      <Text variant="caption" muted style={{ textAlign: "center" }}>
        {IN_APP_PURCHASES
          ? `Prove gratuite senza carta. Abbonamenti mensili con ${STORE_NAME}, disdici quando vuoi.`
          : "Prove gratuite senza carta. Abbonamenti mensili con Stripe, disdici quando vuoi."}
      </Text>
    </Screen>
  );
}
