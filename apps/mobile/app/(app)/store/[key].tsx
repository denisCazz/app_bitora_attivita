import { isDemoEmail, isUsable, type ManifestModule } from "@rapportini/shared";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { Platform, View } from "react-native";
import { Badge, Button, Card, EmptyState, Pressy, Screen, Text, useTheme } from "@rapportini/ui";
import { API_URL } from "../../../src/api/client";
import { daysLeft, monthly, useBillingPortal, useBuyModule, useRestorePurchases, useStartTrial, useStoreOffer } from "../../../src/billing";
import { ModuleIcon } from "../../../src/components/ModuleIcon";
import { IN_APP_PURCHASES, manageSubscriptions, PurchaseCancelled, PurchasePending, STORE_NAME } from "../../../src/iap";
import { can, useManifest } from "../../../src/session";

type Notice = { tone: "success" | "danger" | "muted"; text: string } | null;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
}

function Point({ icon, children }: { icon: keyof typeof Ionicons.glyphMap; children: string }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
      <Ionicons name={icon} size={18} color={theme.colors.accent} style={{ marginTop: 2 }} />
      <Text style={{ flex: 1 }}>{children}</Text>
    </View>
  );
}

function Terms({ lines }: { lines: string[] }) {
  return (
    <View style={{ gap: 6 }}>
      {lines.map((line) => (
        <Text key={line} variant="caption" muted>
          {`• ${line}`}
        </Text>
      ))}
    </View>
  );
}

function LegalLinks() {
  const theme = useTheme();
  const open = (path: string) => void WebBrowser.openBrowserAsync(`${API_URL}${path}`);
  return (
    <View style={{ flexDirection: "row", gap: 16, flexWrap: "wrap" }}>
      <Pressy onPress={() => open("/legal/terms")}>
        <Text variant="caption" style={{ color: theme.colors.accent, fontWeight: "700" }}>
          Termini d'uso (EULA)
        </Text>
      </Pressy>
      <Pressy onPress={() => open("/legal/privacy")}>
        <Text variant="caption" style={{ color: theme.colors.accent, fontWeight: "700" }}>
          Informativa privacy
        </Text>
      </Pressy>
    </View>
  );
}

function storeTerms(module: ManifestModule, price: string, freeTrial: string | null) {
  const account = Platform.OS === "ios" ? "ID Apple" : "account Google Play";
  return [
    `Abbonamento mensile a rinnovo automatico al modulo ${module.label}: ${price} al mese, IVA inclusa.`,
    freeTrial ? `Se hai diritto alla prova gratuita, per ${freeTrial} non paghi nulla; poi l'abbonamento parte a ${price} al mese, salvo disdetta prima della fine della prova.` : null,
    `Il pagamento viene addebitato sul tuo ${account} alla conferma dell'acquisto.`,
    Platform.OS === "ios"
      ? "L'abbonamento si rinnova ogni mese allo stesso prezzo, a meno che non venga disdetto almeno 24 ore prima della fine del periodo in corso. Il rinnovo viene addebitato nelle 24 ore precedenti."
      : "L'abbonamento si rinnova ogni mese allo stesso prezzo finché non lo disdici.",
    `Puoi gestire o disdire l'abbonamento quando vuoi dalle impostazioni del tuo account ${STORE_NAME}: il modulo resta attivo fino alla fine del periodo già pagato.`,
    "Il modulo si attiva per tutta la tua attività, per tutti gli utenti e su tutti i dispositivi.",
  ].filter((line): line is string => Boolean(line));
}

function webTerms(module: ManifestModule, price: string) {
  return [
    `Abbonamento mensile a rinnovo automatico al modulo ${module.label}: ${price}. L'importo finale, con le eventuali imposte, viene mostrato prima della conferma.`,
    "Pagamento con carta tramite Stripe. Il primo mese viene addebitato subito, poi ogni mese alla stessa data.",
    "Disdici quando vuoi da «Gestisci abbonamento»: il modulo resta attivo fino alla fine del mese già pagato.",
    "Il modulo si attiva per tutta la tua attività, per tutti gli utenti e su tutti i dispositivi.",
  ];
}

export default function ModuleDetailScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { key } = useLocalSearchParams<{ key: string }>();
  const manifest = useManifest();
  const modules = manifest.data?.modules ?? [];
  const module = modules.find((item) => item.key === key);
  const canBuy = can(manifest.data, "settings.manage");
  const demo = isDemoEmail(manifest.data?.user.email ?? "");
  const offer = useStoreOffer(module);
  const buy = useBuyModule();
  const trial = useStartTrial();
  const restore = useRestorePurchases();
  const portal = useBillingPortal();
  const [consent, setConsent] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  if (!module) {
    return (
      <Screen onBack={() => router.back()} backLabel="Store">
        {manifest.isLoading ? null : <EmptyState title="Modulo non disponibile" message="Questo modulo non fa parte della tua attività." />}
      </Screen>
    );
  }

  const inTrial = module.status === "trial";
  const purchasable = !module.free && (module.status === "locked" || inTrial);
  const trialUsed = Boolean(module.trialEndsAt) && !inTrial;
  const price = IN_APP_PURCHASES ? (offer.data?.displayPrice ?? null) : monthly(module.priceCents);
  const freeTrial = IN_APP_PURCHASES && !inTrial ? (offer.data?.freeTrial ?? null) : null;
  const missing = module.requires.map((required) => modules.find((item) => item.key === required)).filter((item): item is ManifestModule => Boolean(item && !isUsable(item.status)));
  const storeUnavailable = IN_APP_PURCHASES && !offer.isLoading && (offer.isError || !offer.data);
  const ready = IN_APP_PURCHASES ? Boolean(offer.data) : consent;

  function pay() {
    setNotice(null);
    buy.mutate(
      { module: module!, offer: offer.data },
      {
        onSuccess: () => setNotice(IN_APP_PURCHASES ? { tone: "success", text: `${module!.label} è attivo. Grazie!` } : null),
        onError: (error: Error) => {
          if (error instanceof PurchaseCancelled) setNotice({ tone: "muted", text: "Acquisto annullato: nessun addebito." });
          else if (error instanceof PurchasePending) setNotice({ tone: "muted", text: error.message });
          else setNotice({ tone: "danger", text: error.message });
        },
      },
    );
  }

  function run(action: Promise<unknown>, success?: string) {
    setNotice(null);
    action.then(() => success && setNotice({ tone: "success", text: success })).catch((error: Error) => setNotice({ tone: "danger", text: error.message }));
  }

  const payLabel = price
    ? freeTrial
      ? `Prova gratis ${freeTrial}, poi ${price}/mese`
      : IN_APP_PURCHASES
        ? `Paga e attiva · ${price}/mese`
        : `Paga e attiva · ${price}`
    : "Paga e attiva";

  return (
    <Screen onBack={() => router.back()} backLabel="Store">
      <View style={{ alignItems: "flex-start", gap: 12 }}>
        <ModuleIcon name={module.icon} active={!purchasable} size={64} />
        <View style={{ gap: 4 }}>
          <Text variant="display">{module.label}</Text>
          <Text muted>{module.pitch || module.description}</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          {module.free ? <Badge tone="success" label="Incluso nel piano" /> : null}
          {!module.free && module.status === "locked" ? <Badge label="Da sbloccare" /> : null}
          {inTrial ? <Badge tone="accent" label={`In prova · ${daysLeft(module.trialEndsAt)} giorni`} /> : null}
          {!module.free && (module.status === "active" || module.status === "off") ? <Badge tone="success" label={module.status === "off" ? "Attivo (spento)" : "Attivo"} /> : null}
        </View>
      </View>

      {demo && module.status === "locked" ? (
        <Card style={{ gap: 6, borderColor: theme.colors.warning, borderWidth: 1 }}>
          <Text variant="heading">Modulo di prova della demo</Text>
          <Text variant="caption" muted>
            {IN_APP_PURCHASES
              ? `Nella demo è tutto sbloccato tranne questo modulo, per provare un acquisto vero. Con una build di sviluppo o TestFlight il pagamento passa dalla sandbox di ${STORE_NAME} e non viene addebitato nulla; dall'app pubblicata sullo store l'addebito è reale.`
              : "Nella demo è tutto sbloccato tranne questo modulo, per provare un acquisto vero. Con le chiavi Stripe di test usa la carta 4242 4242 4242 4242; con le chiavi live l'addebito è reale."}
          </Text>
        </Card>
      ) : null}

      <Card style={{ gap: 10 }}>
        <Text variant="heading">Cosa fa</Text>
        <Text>{module.details || module.description}</Text>
      </Card>

      {module.features.length ? (
        <Card style={{ gap: 12 }}>
          <Text variant="heading">Cosa include</Text>
          {module.features.map((feature) => (
            <Point key={feature} icon="checkmark-circle">
              {feature}
            </Point>
          ))}
        </Card>
      ) : null}

      {missing.length ? (
        <Card style={{ gap: 10 }}>
          <Text variant="heading">Funziona insieme a</Text>
          <Text variant="caption" muted>
            Per usarlo al meglio ti servono anche questi moduli:
          </Text>
          {missing.map((item) => (
            <Pressy key={item.key} onPress={() => router.push({ pathname: "/(app)/store/[key]", params: { key: item.key } })}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <ModuleIcon name={item.icon} size={32} />
                <Text style={{ flex: 1, fontWeight: "700" }}>{item.label}</Text>
                <Ionicons name="chevron-forward" size={16} color={theme.colors.inkSoft} />
              </View>
            </Pressy>
          ))}
        </Card>
      ) : null}

      {!module.free && !purchasable ? (
        <Card style={{ gap: 10 }}>
          <Text variant="heading">Il tuo abbonamento</Text>
          <Text variant="caption" muted>
            {module.billingSource === "DEMO"
              ? "Incluso gratuitamente nell'account demo."
              : module.billingSource === "STRIPE"
                ? "Attivato con carta dal sito web. Si rinnova ogni mese finché non lo disdici."
                : module.billingSource === "APPLE" || module.billingSource === "GOOGLE"
                  ? `Attivato con ${module.billingSource === "APPLE" ? "App Store" : "Google Play"}.${module.licenseExpiresAt ? ` Periodo pagato fino al ${formatDate(module.licenseExpiresAt)}, poi si rinnova se non lo disdici.` : ""}`
                  : "Attivo per la tua attività."}
          </Text>
          {isUsable(module.status) ? <Button tone="secondary" label={`Apri ${module.label}`} onPress={() => router.push(`/(app)${module.route}` as never)} /> : null}
          {canBuy && IN_APP_PURCHASES && (module.billingSource === "APPLE" || module.billingSource === "GOOGLE") ? (
            <Button tone="ghost" label={`Gestisci o disdici su ${STORE_NAME}`} onPress={() => run(manageSubscriptions(module.storeProductId))} />
          ) : null}
          {canBuy && !IN_APP_PURCHASES && module.billingSource === "STRIPE" ? (
            <Button tone="ghost" label="Gestisci o disdici" loading={portal.isPending} onPress={() => run(portal.mutateAsync())} />
          ) : null}
          {canBuy && !IN_APP_PURCHASES && (module.billingSource === "APPLE" || module.billingSource === "GOOGLE") ? (
            <Text variant="caption" muted>
              {`Lo gestisci dalle impostazioni del tuo account ${module.billingSource === "APPLE" ? "App Store" : "Google Play"}.`}
            </Text>
          ) : null}
        </Card>
      ) : null}

      {purchasable ? (
        <Card style={{ gap: 14 }}>
          <View style={{ gap: 2 }}>
            <Text variant="caption" muted>
              {inTrial ? "Per tenerlo dopo la prova" : "Prezzo"}
            </Text>
            <Text variant="display">{price ?? (offer.isLoading ? "…" : monthly(module.priceCents))}</Text>
            <Text variant="caption" muted>
              {IN_APP_PURCHASES ? "al mese, IVA inclusa · abbonamento mensile" : "abbonamento mensile"}
            </Text>
          </View>

          <Terms lines={IN_APP_PURCHASES ? storeTerms(module, price ?? "il prezzo indicato", freeTrial) : webTerms(module, price ?? monthly(module.priceCents))} />
          <LegalLinks />

          {canBuy ? (
            <>
              {!IN_APP_PURCHASES ? (
                <Pressy onPress={() => setConsent((value) => !value)}>
                  <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
                    <Ionicons name={consent ? "checkbox" : "square-outline"} size={22} color={consent ? theme.colors.accent : theme.colors.inkSoft} />
                    <Text variant="caption" style={{ flex: 1 }}>
                      Accetto i Termini d'uso e chiedo che il modulo sia attivato subito. Se acquisto come consumatore, prendo atto che con l'attivazione immediata perdo il diritto di recesso di 14 giorni (art. 59, lett. o, Codice del Consumo).
                    </Text>
                  </View>
                </Pressy>
              ) : null}

              {storeUnavailable ? (
                <Text variant="caption" style={{ color: theme.colors.danger }}>
                  {offer.error instanceof Error ? offer.error.message : `Questo modulo non è ancora in vendita su ${STORE_NAME}. Riprova più tardi.`}
                </Text>
              ) : null}

              <Button label={payLabel} loading={buy.isPending} disabled={!ready || buy.isPending} onPress={pay} style={{ opacity: ready ? 1 : 0.5 }} />

              {!IN_APP_PURCHASES && !inTrial && !trialUsed && module.trialDays > 0 ? (
                <Button
                  tone="secondary"
                  label={`Prova gratis ${module.trialDays} giorni, senza carta`}
                  loading={trial.isPending}
                  onPress={() => run(trial.mutateAsync(module.key), `Prova attiva per ${module.trialDays} giorni.`)}
                />
              ) : null}
              {IN_APP_PURCHASES ? (
                <Button
                  tone="ghost"
                  label="Ripristina acquisti"
                  loading={restore.isPending}
                  onPress={() =>
                    restore.mutate(undefined, {
                      onSuccess: ({ restored }) => setNotice({ tone: restored ? "success" : "muted", text: restored ? "Acquisti ripristinati." : `Nessun abbonamento attivo trovato su ${STORE_NAME}.` }),
                      onError: (error: Error) => setNotice({ tone: "danger", text: error.message }),
                    })
                  }
                />
              ) : null}
            </>
          ) : (
            <Text variant="caption" muted>
              Solo il titolare può attivare i moduli: chiedigli di sbloccarlo.
            </Text>
          )}

          {notice ? (
            <Text variant="caption" style={{ color: notice.tone === "danger" ? theme.colors.danger : notice.tone === "success" ? theme.colors.success : theme.colors.inkSoft }}>
              {notice.text}
            </Text>
          ) : null}
        </Card>
      ) : notice ? (
        <Text variant="caption" style={{ color: notice.tone === "danger" ? theme.colors.danger : theme.colors.inkSoft }}>
          {notice.text}
        </Text>
      ) : null}
    </Screen>
  );
}
