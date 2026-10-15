import { isUsable, trialKeys, type ManifestModule } from "@rapportini/shared";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Badge, Button, Card, EmptyState, Pressy, Screen, Text, useTheme } from "@rapportini/ui";
import { daysLeft, formatDate, trialDate, useStartTrial, type Notice } from "../../../src/billing";
import { ModuleIcon } from "../../../src/components/ModuleIcon";
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

export default function ModuleDetailScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { key } = useLocalSearchParams<{ key: string }>();
  const manifest = useManifest();
  const modules = manifest.data?.modules ?? [];
  const module = modules.find((item) => item.key === key);
  const canManage = can(manifest.data, "settings.manage");
  const trial = useStartTrial();
  const [notice, setNotice] = useState<Notice | null>(null);

  if (!module) {
    return (
      <Screen onBack={() => router.back()} backLabel="Moduli">
        {manifest.isLoading ? null : <EmptyState title="Modulo non disponibile" message="Questo modulo non fa parte della tua attività." />}
      </Screen>
    );
  }

  const inTrial = module.status === "trial";
  const lockedOrTrial = !module.free && (module.status === "locked" || inTrial);
  const trialUsed = Boolean(module.trialEndsAt) && !inTrial && lockedOrTrial;
  const trialAvailable = lockedOrTrial && !inTrial && !trialUsed && module.trialDays > 0;
  const missing = module.requires.map((required) => modules.find((item) => item.key === required)).filter((item): item is ManifestModule => Boolean(item && !isUsable(item.status)));
  const trialCompanions = trialAvailable
    ? trialKeys(modules, [module.key])
        .filter((companion) => companion !== module.key)
        .map((companion) => modules.find((item) => item.key === companion))
        .filter((item): item is ManifestModule => Boolean(item && item.status === "locked" && !item.trialEndsAt))
    : [];

  function startTrial() {
    setNotice(null);
    trial.mutate(module!.key, {
      onSuccess: (result) => {
        const others = result.started
          .filter((item) => item.moduleKey !== module!.key)
          .map((item) => modules.find((candidate) => candidate.key === item.moduleKey)?.label ?? item.moduleKey);
        const until = result.trialEndsAt ? ` fino al ${formatDate(result.trialEndsAt)}` : "";
        setNotice({ tone: "success", text: `Prova attiva${until}.${others.length ? ` In prova anche: ${others.join(", ")}.` : ""}` });
      },
      onError: (error: Error) => setNotice({ tone: "danger", text: error.message }),
    });
  }

  return (
    <Screen onBack={() => router.back()} backLabel="Moduli">
      <View style={{ alignItems: "flex-start", gap: 12 }}>
        <ModuleIcon name={module.icon} active={!lockedOrTrial} size={64} />
        <View style={{ gap: 4 }}>
          <Text variant="display">{module.label}</Text>
          <Text muted>{module.pitch || module.description}</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          {module.free ? <Badge tone="success" label="Incluso nel piano" /> : null}
          {!module.free && module.status === "locked" ? <Badge label="Modulo aggiuntivo" /> : null}
          {inTrial ? <Badge tone="accent" label={`In prova · ${daysLeft(module.trialEndsAt)} giorni`} /> : null}
          {!module.free && (module.status === "active" || module.status === "off") ? <Badge tone="success" label={module.status === "off" ? "Attivo (spento)" : "Attivo"} /> : null}
        </View>
      </View>

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

      {!module.free && !lockedOrTrial ? (
        <Card style={{ gap: 10 }}>
          <Text variant="heading">Stato del modulo</Text>
          <Text variant="caption" muted>
            Modulo attivo per tutta la tua attività.
          </Text>
          {isUsable(module.status) ? <Button tone="secondary" label={`Apri ${module.label}`} onPress={() => router.push(`/(app)${module.route}` as never)} /> : null}
        </Card>
      ) : null}

      {inTrial && module.trialEndsAt ? (
        <Card style={{ gap: 10, borderColor: theme.colors.accent, borderWidth: 1 }}>
          <Text variant="heading">{`In prova fino al ${formatDate(module.trialEndsAt)}`}</Text>
          <Point icon="checkmark-circle-outline">La prova finisce da sola, senza impegno.</Point>
          <Point icon="lock-closed-outline">Alla scadenza il modulo si blocca e i dati inseriti restano salvati.</Point>
          <Point icon="chatbubble-ellipses-outline">Ti contatteremo per sapere se vuoi mantenerlo attivo.</Point>
        </Card>
      ) : null}

      {trialAvailable ? (
        <Card style={{ gap: 12 }}>
          <Text variant="heading">{`Provalo gratis per ${module.trialDays} giorni`}</Text>
          <Point icon="checkmark-circle-outline">Senza impegno: provalo nella tua attività.</Point>
          <Point icon="calendar-outline">{`Finisce da sola il ${trialDate(module.trialDays)}: i dati restano salvati.`}</Point>
          {trialCompanions.length ? <Point icon="git-merge-outline">{`Per farlo funzionare mettiamo in prova anche: ${trialCompanions.map((item) => item.label).join(", ")}.`}</Point> : null}
          <Text variant="caption" muted>
            Una sola prova per modulo.
          </Text>
          {canManage ? <Button label="Inizia la prova gratuita" loading={trial.isPending} onPress={startTrial} /> : null}
        </Card>
      ) : null}

      {trialUsed ? (
        <Text variant="caption" muted>
          {`Hai già usato la prova gratuita di questo modulo (terminata il ${formatDate(module.trialEndsAt!)}).`}
        </Text>
      ) : null}

      {lockedOrTrial ? (
        <Card style={{ gap: 8 }}>
          <Text variant="heading">Come attivare il modulo</Text>
          <Text variant="caption" muted>
            Per attivare i moduli aggiuntivi per la tua attività, ti invieremo direttamente un messaggio o puoi richiedercelo quando vuoi: penseremo noi a sbloccarlo sul tuo negozio.
          </Text>
        </Card>
      ) : null}

      <NoticeText notice={notice} />
    </Screen>
  );
}
