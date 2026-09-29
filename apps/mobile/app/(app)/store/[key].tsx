import { isDemoEmail, isUsable, stripeTrialEnd, trialKeys, type ManifestModule } from "@rapportini/shared";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { Platform, View } from "react-native";
import { Badge, Button, Card, EmptyState, Pressy, Screen, Text, useTheme } from "@rapportini/ui";
import { API_URL } from "../../../src/api/client";
import {
  billingLine,
  checkoutNotice,
  daysLeft,
  euro,
  formatDate,
  trialDate,
  useBillingPortal,
  useBuyModule,
  useCheckoutResult,
  useRestorePurchases,
  useStartTrial,
  useStoreOffers,
  type Notice,
} from "../../../src/billing";
import { ModuleIcon } from "../../../src/components/ModuleIcon";
import { IN_APP_PURCHASES, manageSubscriptions, PurchaseCancelled, PurchasePending, STORE_NAME, type StoreOffer } from "../../../src/iap";
import { can, useManifest } from "../../../src/session";

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

function CostRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
      <Text variant="caption" muted>
        {label}
      </Text>
      <Text variant={strong ? "heading" : "caption"} style={{ flex: 1, textAlign: "right", fontWeight: "700" }}>
        {value}
      </Text>
    </View>
  );
}

function NoticeText({ notice }: { notice: Notice | null }) {
  const theme = useTheme();
  if (!notice) return null;
  const color = notice.tone === "danger" ? theme.colors.danger : notice.tone === "success" ? theme.colors.success : theme.colors.inkSoft;
  return (
    <Text variant="caption" style={{ color }}>
      {notice.text}
    </Text>
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

interface Plan {
  /** What leaves the account today. */
  today: string;
  /** What is charged afterwards and from when. */
  then: string;
  button: string;
  terms: string[];
  /** Warns that subscribing now doesn't wait for the end of the Bitora trial. */
  trialLost: boolean;
}

function storePlan(module: ManifestModule, offer: StoreOffer, inTrial: boolean): Plan {
  const price = offer.displayPrice;
  const account = Platform.OS === "ios" ? "ID Apple" : "account Google Play";
  const cancelNotice = Platform.OS === "ios" ? "almeno 24 ore prima" : "prima";
  const terms = [
    `Abbonamento mensile a rinnovo automatico al modulo ${module.label}: ${price} al mese, IVA inclusa.`,
    offer.freeTrial
      ? `Prova gratuita di ${offer.freeTrial} offerta da ${STORE_NAME}: oggi non paghi nulla. Alla fine della prova parte l'abbonamento a ${price} al mese, salvo disdetta ${cancelNotice} della fine della prova.`
      : null,
    offer.introPrice ? `Prezzo di benvenuto: ${offer.introPrice}, poi ${price} al mese.` : null,
    `Il pagamento viene addebitato sul tuo ${account}${offer.freeTrial ? " alla fine della prova" : " alla conferma dell'acquisto"}.`,
    Platform.OS === "ios"
      ? "L'abbonamento si rinnova ogni mese allo stesso prezzo, a meno che non venga disdetto almeno 24 ore prima della fine del periodo in corso. Il rinnovo viene addebitato nelle 24 ore precedenti."
      : "L'abbonamento si rinnova ogni mese allo stesso prezzo finché non lo disdici.",
    `Puoi gestire o disdire l'abbonamento quando vuoi dalle impostazioni del tuo account ${STORE_NAME}: il modulo resta attivo fino alla fine del periodo già pagato.`,
    "Il modulo si attiva per tutta la tua attività, per tutti gli utenti e su tutti i dispositivi.",
  ].filter((line): line is string => Boolean(line));
  if (offer.freeTrial) {
    return { today: "0 €", then: `${price} al mese dopo ${offer.freeTrial}`, button: `Prova ${offer.freeTrial} gratis, poi ${price}/mese`, terms, trialLost: false };
  }
  if (offer.introPrice) {
    return { today: offer.introPrice, then: `${price} al mese dopo il periodo di benvenuto`, button: `Abbonati · ${offer.introPrice}`, terms, trialLost: inTrial };
  }
  return { today: price, then: `${price} ogni mese, alla stessa data`, button: `Abbonati · ${price}/mese`, terms, trialLost: inTrial };
}

function webPlan(module: ManifestModule, inTrial: boolean): Plan {
  const price = euro(module.priceCents);
  const deferred = inTrial ? stripeTrialEnd(module.trialEndsAt) : null;
  const firstCharge = deferred ? formatDate(deferred.toISOString()) : null;
  const terms = [
    `Abbonamento mensile a rinnovo automatico al modulo ${module.label}: ${price} al mese. È l'importo finale, senza costi aggiuntivi.`,
    firstCharge
      ? `Oggi non paghi nulla: inserisci la carta e il primo addebito avviene il ${firstCharge}, quando finisce la prova. Se disdici prima, non paghi niente.`
      : "Pagamento con carta tramite Stripe: il primo mese viene addebitato subito, poi ogni mese alla stessa data.",
    "Disdici quando vuoi da «Gestisci abbonamento»: il modulo resta attivo fino alla fine del mese già pagato, senza altri addebiti.",
    "Il modulo si attiva per tutta la tua attività, per tutti gli utenti e su tutti i dispositivi.",
  ];
  if (firstCharge) return { today: "0 €", then: `${price} al mese dal ${firstCharge}`, button: `Abbonati ora · paghi dal ${firstCharge}`, terms, trialLost: false };
  return { today: price, then: `${price} ogni mese, alla stessa data`, button: `Paga ${price} e attiva`, terms, trialLost: inTrial };
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
  const offers = useStoreOffers(module ? [module] : []);
  const buy = useBuyModule();
  const trial = useStartTrial();
  const restore = useRestorePurchases();
  const portal = useBillingPortal();
  const [consent, setConsent] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  useCheckoutResult((result) => setNotice(checkoutNotice(result)));

  if (!module) {
    return (
      <Screen onBack={() => router.back()} backLabel="Store">
        {manifest.isLoading ? null : <EmptyState title="Modulo non disponibile" message="Questo modulo non fa parte della tua attività." />}
      </Screen>
    );
  }

  const offer = offers.data?.[module.storeProductId] ?? null;
  const inTrial = module.status === "trial";
  const purchasable = !module.free && (module.status === "locked" || inTrial);
  const trialUsed = Boolean(module.trialEndsAt) && !inTrial && purchasable;
  const trialAvailable = purchasable && !inTrial && !trialUsed && module.trialDays > 0;
  const plan = IN_APP_PURCHASES ? (offer ? storePlan(module, offer, inTrial) : null) : webPlan(module, inTrial);
  const monthlyPrice = IN_APP_PURCHASES && offer ? `${offer.displayPrice}/mese` : `${euro(module.priceCents)}/mese`;
  const missing = module.requires.map((required) => modules.find((item) => item.key === required)).filter((item): item is ManifestModule => Boolean(item && !isUsable(item.status)));
  const trialCompanions = trialAvailable
    ? trialKeys(modules, [module.key])
        .filter((companion) => companion !== module.key)
        .map((companion) => modules.find((item) => item.key === companion))
        .filter((item): item is ManifestModule => Boolean(item && item.status === "locked" && !item.trialEndsAt))
    : [];
  const storeUnavailable = IN_APP_PURCHASES && !offers.isLoading && !offer;
  const ready = IN_APP_PURCHASES ? Boolean(offer) : consent;

  function pay() {
    setNotice(null);
    buy.mutate(
      { module: module!, offer },
      {
        onSuccess: (result) => {
          if (result.mode === "store") setNotice({ tone: "success", text: `${module!.label} è attivo. Grazie!` });
          else if (result.mode === "demo") setNotice({ tone: "success", text: `${module!.label} è attivo (modalità demo: nessun addebito).` });
          else if (result.outcome) setNotice(checkoutNotice(result.outcome));
          else setNotice({ tone: "muted", text: "Completa il pagamento nella pagina di Stripe: quando torni qui il modulo si attiva da solo." });
        },
        onError: (error: Error) => {
          if (error instanceof PurchaseCancelled) setNotice({ tone: "muted", text: "Acquisto annullato: nessun addebito." });
          else if (error instanceof PurchasePending) setNotice({ tone: "muted", text: error.message });
          else setNotice({ tone: "danger", text: error.message });
        },
      },
    );
  }

  function startTrial() {
    setNotice(null);
    trial.mutate(module!.key, {
      onSuccess: (result) => {
        const others = result.started
          .filter((item) => item.moduleKey !== module!.key)
          .map((item) => modules.find((candidate) => candidate.key === item.moduleKey)?.label ?? item.moduleKey);
        const until = result.trialEndsAt ? ` fino al ${formatDate(result.trialEndsAt)}` : "";
        setNotice({ tone: "success", text: `Prova attiva${until}. Nessun addebito.${others.length ? ` In prova anche: ${others.join(", ")}.` : ""}` });
      },
      onError: (error: Error) => setNotice({ tone: "danger", text: error.message }),
    });
  }

  function run(action: Promise<unknown>) {
    setNotice(null);
    action.catch((error: Error) => setNotice({ tone: "danger", text: error.message }));
  }

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
          {module.renews === false ? <Badge tone="warning" label="Disdetto" /> : null}
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
            {billingLine(module, monthlyPrice) ?? "Attivo per la tua attività."}
          </Text>
          {isUsable(module.status) ? <Button tone="secondary" label={`Apri ${module.label}`} onPress={() => router.push(`/(app)${module.route}` as never)} /> : null}
          {canBuy && IN_APP_PURCHASES && (module.billingSource === "APPLE" || module.billingSource === "GOOGLE") ? (
            <Button tone="ghost" label={`Gestisci o disdici su ${STORE_NAME}`} onPress={() => run(manageSubscriptions(module.storeProductId))} />
          ) : null}
          {canBuy && !IN_APP_PURCHASES && module.billingSource === "STRIPE" ? (
            <Button tone="ghost" label="Gestisci o disdici" loading={portal.isPending} onPress={() => run(portal.mutateAsync())} />
          ) : null}
          {canBuy && IN_APP_PURCHASES && module.billingSource === "STRIPE" ? (
            <Text variant="caption" muted>
              Attivato dal sito web: lo gestisci o lo disdici da lì.
            </Text>
          ) : null}
          {canBuy && !IN_APP_PURCHASES && (module.billingSource === "APPLE" || module.billingSource === "GOOGLE") ? (
            <Text variant="caption" muted>
              {`Lo gestisci dalle impostazioni del tuo account ${module.billingSource === "APPLE" ? "App Store" : "Google Play"}.`}
            </Text>
          ) : null}
        </Card>
      ) : null}

      {inTrial && module.trialEndsAt ? (
        <Card style={{ gap: 10, borderColor: theme.colors.accent, borderWidth: 1 }}>
          <Text variant="heading">{`In prova fino al ${formatDate(module.trialEndsAt)}`}</Text>
          <Point icon="card-outline">Nessuna carta collegata: la prova non si trasforma in abbonamento e non paghi nulla.</Point>
          <Point icon="lock-closed-outline">Alla scadenza il modulo si blocca da solo. I dati che hai inserito restano salvati e tornano visibili se ti abboni.</Point>
          <Point icon="notifications-outline">Ti avvisiamo 2 giorni prima della fine.</Point>
        </Card>
      ) : null}

      {trialAvailable ? (
        <Card style={{ gap: 12 }}>
          <Text variant="heading">{`Provalo gratis per ${module.trialDays} giorni`}</Text>
          <Point icon="card-outline">Senza carta e senza impegno: oggi e alla fine della prova non paghi nulla.</Point>
          <Point icon="calendar-outline">{`Finisce da sola il ${trialDate(module.trialDays)}: il modulo si blocca, niente rinnovo automatico.`}</Point>
          <Point icon="notifications-outline">Ti avvisiamo 2 giorni prima. Se ti è utile, ti abboni quando vuoi.</Point>
          {trialCompanions.length ? <Point icon="git-merge-outline">{`Per farlo funzionare mettiamo in prova anche: ${trialCompanions.map((item) => item.label).join(", ")}.`}</Point> : null}
          <Text variant="caption" muted>
            Una sola prova per modulo.
          </Text>
          {canBuy ? <Button label="Inizia la prova gratuita" loading={trial.isPending} onPress={startTrial} /> : null}
        </Card>
      ) : null}

      {trialUsed ? (
        <Text variant="caption" muted>
          {`Hai già usato la prova gratuita di questo modulo (terminata il ${formatDate(module.trialEndsAt!)}).`}
        </Text>
      ) : null}

      {purchasable ? (
        <Card style={{ gap: 14 }}>
          <View style={{ gap: 2 }}>
            <Text variant="caption" muted>
              {inTrial ? "Per tenerlo dopo la prova" : trialAvailable ? "Oppure abbonati subito" : "Abbonamento"}
            </Text>
            <Text variant="display">{IN_APP_PURCHASES ? (offer?.displayPrice ?? (offers.isLoading ? "…" : euro(module.priceCents))) : euro(module.priceCents)}</Text>
            <Text variant="caption" muted>
              {IN_APP_PURCHASES ? "al mese, IVA inclusa · disdici quando vuoi" : "al mese, importo finale · disdici quando vuoi"}
            </Text>
          </View>

          {plan ? (
            <View style={{ gap: 8, padding: 12, borderRadius: theme.radius.md, backgroundColor: theme.colors.field }}>
              <CostRow label="Paghi oggi" value={plan.today} strong />
              <CostRow label="Poi" value={plan.then} />
              <CostRow label="Disdetta" value="Quando vuoi, resta attivo fino a fine periodo" />
            </View>
          ) : null}

          {plan?.trialLost && module.trialEndsAt ? (
            <Text variant="caption" style={{ color: theme.colors.warning }}>
              {`Se ti abboni ora, l'abbonamento parte da oggi e i giorni di prova rimasti non vengono scalati. Puoi anche aspettare: la prova resta attiva fino al ${formatDate(module.trialEndsAt)} e ti avvisiamo prima.`}
            </Text>
          ) : null}

          {plan ? <Terms lines={plan.terms} /> : null}
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
                  {offers.error instanceof Error ? offers.error.message : `Questo modulo non è ancora in vendita su ${STORE_NAME}. Riprova più tardi.`}
                </Text>
              ) : null}

              <Button
                tone={trialAvailable ? "secondary" : undefined}
                label={plan?.button ?? "Abbonati"}
                loading={buy.isPending}
                disabled={!ready || buy.isPending}
                onPress={pay}
                style={{ opacity: ready ? 1 : 0.5 }}
              />

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

          <NoticeText notice={notice} />
        </Card>
      ) : (
        <NoticeText notice={notice} />
      )}
    </Screen>
  );
}
