import { DEFAULT_REMINDER_MESSAGE, REMINDER_PLACEHOLDERS, reminderMessage, reminderSettingsSchema, type ReminderSettings } from "@rapportini/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Button, Card, Input, Screen, Text, useTheme } from "@rapportini/ui";
import { http } from "../../../src/api/client";
import { queryClient } from "../../../src/api/query";
import { Chip } from "../../../src/components/Chip";
import { QueryState } from "../../../src/components/States";
import { useManifest } from "../../../src/session";

type Settings = ReminderSettings & { emailReady: boolean };

const DAYS = [7, 14, 30, 60];

export default function ReminderSettingsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const manifest = useManifest();
  const [enabled, setEnabled] = useState(false);
  const [daysBefore, setDaysBefore] = useState(30);
  const [autoEmail, setAutoEmail] = useState(true);
  const [message, setMessage] = useState("");
  const [ready, setReady] = useState(false);

  const settings = useQuery({ queryKey: ["reminder-settings"], queryFn: () => http.get<Settings>("/settings/reminders") });

  useEffect(() => {
    if (!settings.data || ready) return;
    setEnabled(settings.data.enabled);
    setDaysBefore(settings.data.daysBefore);
    setAutoEmail(settings.data.autoEmail);
    setMessage(settings.data.message ?? "");
    setReady(true);
  }, [settings.data, ready]);

  const save = useMutation({
    mutationFn: () => http.put("/settings/reminders", reminderSettingsSchema.parse({ enabled, daysBefore, autoEmail, message: message.trim() || null })),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["reminder-settings"] });
      await queryClient.invalidateQueries({ queryKey: ["customer-reminders"] });
    },
  });

  const preview = reminderMessage(message, {
    customerName: "Mario Rossi",
    what: "Pulizia annuale",
    asset: manifest.data?.tenant.terminology.asset ?? "l'impianto",
    dueAt: new Date(Date.now() + daysBefore * 86_400_000),
    business: manifest.data?.tenant.name ?? "Il tuo negozio",
  });

  return (
    <Screen onBack={() => router.back()} backLabel="Impostazioni">
      <Text variant="display">Promemoria ai clienti</Text>
      <Text muted>Prima di ogni scadenza avvisi il cliente e gli proponi l'appuntamento. Chi riceve l'email può smettere con un clic.</Text>
      <QueryState isLoading={settings.isLoading} error={settings.error} refetch={() => settings.refetch()}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Chip label="Attivi" active={enabled} onPress={() => setEnabled(true)} />
          <Chip label="Spenti" active={!enabled} onPress={() => setEnabled(false)} />
        </View>
        <Text variant="label" muted>
          Quanto prima della scadenza
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {DAYS.map((days) => (
            <Chip key={days} label={`${days} giorni`} active={daysBefore === days} onPress={() => setDaysBefore(days)} />
          ))}
        </View>
        <Text variant="label" muted>
          Email
        </Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Chip label="Parte da sola" active={autoEmail} onPress={() => setAutoEmail(true)} />
          <Chip label="La mando io" active={!autoEmail} onPress={() => setAutoEmail(false)} />
        </View>
        {settings.data && !settings.data.emailReady ? (
          <Text variant="caption" style={{ color: theme.colors.warning }}>
            L'invio email non è ancora configurato sul server: per ora puoi avvisare con WhatsApp o dalla tua app di posta.
          </Text>
        ) : null}
        <Text variant="caption" muted>
          WhatsApp parte sempre da te: nella lista "Da avvisare" tocchi il cliente e il messaggio è già scritto.
        </Text>
        <Input
          label="Testo del messaggio"
          value={message}
          onChangeText={setMessage}
          multiline
          placeholder={DEFAULT_REMINDER_MESSAGE}
          style={{ minHeight: 120, textAlignVertical: "top", paddingTop: 14 }}
        />
        <Text variant="caption" muted>
          Puoi usare {REMINDER_PLACEHOLDERS.join(" ")}. Lascia vuoto per il testo standard.
        </Text>
        <Card style={{ gap: 6 }}>
          <Text variant="label" muted>
            Anteprima
          </Text>
          <Text>{preview}</Text>
        </Card>
        {save.isSuccess ? <Text style={{ color: theme.colors.success }}>Salvato.</Text> : null}
        {save.error ? <Text style={{ color: theme.colors.danger }}>{save.error.message}</Text> : null}
        <Button label="Salva" loading={save.isPending} onPress={() => save.mutate()} />
      </QueryState>
    </Screen>
  );
}
