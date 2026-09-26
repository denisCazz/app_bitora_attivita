import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { View } from "react-native";
import { Button, Card, Screen, Text, useTheme } from "@rapportini/ui";
import { setAiConsent } from "../account";
import { openLegal } from "../legal";

/** Disclosure required before any data is sent to the AI providers (EU AI Act art. 50, Apple 5.1.2(i), GDPR art. 6.1.a). */
export function AiConsent({ onBack }: { onBack: () => void }) {
  const theme = useTheme();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function agree() {
    setSaving(true);
    setError(null);
    try {
      await setAiConsent(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Non è stato possibile salvare");
      setSaving(false);
    }
  }

  const points: Array<[keyof typeof Ionicons.glyphMap, string]> = [
    ["sparkles-outline", "L'assistente è un sistema di intelligenza artificiale, non una persona. Le risposte sono generate automaticamente e possono essere sbagliate."],
    ["cloud-upload-outline", "Quello che scrivi o dici, e i dati del negozio che servono a rispondere (per esempio clienti, interventi, ordini), vengono inviati a OpenAI, negli Stati Uniti. Le risposte vocali passano da un servizio di sintesi vocale."],
    ["lock-closed-outline", "OpenAI non usa i dati ricevuti tramite API per addestrare i suoi modelli, e noi non archiviamo le conversazioni."],
    ["shield-checkmark-outline", "Prima di creare o modificare qualcosa l'assistente ti chiede sempre conferma."],
    ["refresh-outline", "Puoi revocare il consenso quando vuoi da Altro › Profilo."],
  ];

  return (
    <Screen onBack={onBack}>
      <Text variant="display">Assistente IA</Text>
      <Card style={{ gap: 14 }}>
        {points.map(([icon, text]) => (
          <View key={icon} style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
            <Ionicons name={icon} size={20} color={theme.colors.accent} style={{ marginTop: 2 }} />
            <Text style={{ flex: 1 }}>{text}</Text>
          </View>
        ))}
      </Card>
      <Text variant="caption" muted>
        Dettagli nell'
        <Text variant="caption" style={{ fontWeight: "700", textDecorationLine: "underline" }} onPress={() => void openLegal("privacy")}>
          Informativa privacy
        </Text>
        .
      </Text>
      {error ? <Text style={{ color: theme.colors.danger }}>{error}</Text> : null}
      <Button label="Accetto e attivo l'assistente" loading={saving} onPress={() => void agree()} />
      <Button label="Non ora" tone="ghost" onPress={onBack} />
    </Screen>
  );
}
