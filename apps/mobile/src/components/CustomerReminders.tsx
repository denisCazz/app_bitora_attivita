import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Linking, View } from "react-native";
import { Badge, Button, Card, Text, useTheme } from "@rapportini/ui";
import { http } from "../api/client";
import { queryClient } from "../api/query";
import { can, useManifest } from "../session";

interface Reminder {
  scheduleId: string;
  title: string;
  dueAt: string;
  asset: { id: string; name: string };
  customer: { id: string; name: string; phone: string | null; email: string | null };
  optedOut: boolean;
  booked: { id: string; scheduledAt: string | null } | null;
  emailedAt: string | null;
  whatsappAt: string | null;
  whatsappHref: string | null;
  mailtoHref: string | null;
  canEmail: boolean;
}

interface ReminderList {
  settings: { enabled: boolean; daysBefore: number };
  items: Reminder[];
}

const DAY = 86_400_000;

function dueLabel(value: string) {
  const days = Math.round((new Date(value).getTime() - Date.now()) / DAY);
  if (days < -1) return { text: `Scaduta da ${-days} giorni`, tone: "danger" as const };
  if (days < 0) return { text: "Scaduta ieri", tone: "danger" as const };
  if (days === 0) return { text: "Scade oggi", tone: "warning" as const };
  if (days <= 7) return { text: `Tra ${days} giorn${days === 1 ? "o" : "i"}`, tone: "warning" as const };
  return { text: new Date(value).toLocaleDateString("it-IT", { day: "numeric", month: "long" }), tone: "neutral" as const };
}

function shortDate(value: string) {
  return new Date(value).toLocaleDateString("it-IT", { day: "numeric", month: "short" });
}

function statusLine(item: Reminder) {
  if (item.optedOut) return "Ha chiesto di non ricevere promemoria";
  if (item.booked) return item.booked.scheduledAt ? `Prenotato per il ${shortDate(item.booked.scheduledAt)}` : "Intervento già creato";
  const sent = [item.emailedAt ? `email il ${shortDate(item.emailedAt)}` : null, item.whatsappAt ? `WhatsApp il ${shortDate(item.whatsappAt)}` : null].filter(Boolean);
  return sent.length ? `Avvisato: ${sent.join(", ")}` : "Non ancora avvisato";
}

/** Customers whose maintenance is coming up: one tap to message them, one to book the job. */
export function CustomerReminders() {
  const router = useRouter();
  const theme = useTheme();
  const manifest = useManifest();
  const allowed = can(manifest.data, "customers.read");
  const writable = can(manifest.data, "schedules.write");
  const manage = can(manifest.data, "settings.manage");
  const list = useQuery({
    queryKey: ["customer-reminders"],
    queryFn: () => http.get<ReminderList>("/customer-reminders"),
    enabled: allowed,
  });
  const replace = (next: Reminder) =>
    queryClient.setQueryData<ReminderList>(["customer-reminders"], (current) =>
      current ? { ...current, items: current.items.map((item) => (item.scheduleId === next.scheduleId ? next : item)) } : current,
    );
  const markSent = useMutation({
    mutationFn: (input: { item: Reminder; channel: "WHATSAPP" | "EMAIL" }) => http.post<Reminder>(`/customer-reminders/${input.item.scheduleId}/sent`, { channel: input.channel }),
    onSuccess: replace,
  });
  const email = useMutation({
    mutationFn: (item: Reminder) => http.post<Reminder>(`/customer-reminders/${item.scheduleId}/email`),
    onSuccess: replace,
  });

  if (!allowed || !list.data) return null;
  if (!list.data.settings.enabled) {
    if (!manage) return null;
    return (
      <Card style={{ gap: 8 }}>
        <Text variant="heading">Avvisa i clienti prima delle scadenze</Text>
        <Text muted>Un messaggio pronto per ogni cliente con la manutenzione in arrivo: tu tocchi, lui prenota.</Text>
        <Button label="Attiva i promemoria" tone="secondary" onPress={() => router.push("/(app)/settings/reminders")} />
      </Card>
    );
  }

  const items = [...list.data.items].sort((a, b) => Number(Boolean(a.booked || a.optedOut)) - Number(Boolean(b.booked || b.optedOut)));
  const waiting = items.filter((item) => !item.booked && !item.optedOut && !item.emailedAt && !item.whatsappAt).length;

  async function openWhatsapp(item: Reminder) {
    if (!item.whatsappHref) return;
    await Linking.openURL(item.whatsappHref);
    markSent.mutate({ item, channel: "WHATSAPP" });
  }

  async function sendEmail(item: Reminder) {
    if (item.canEmail) {
      email.mutate(item);
      return;
    }
    if (!item.mailtoHref) return;
    await Linking.openURL(item.mailtoHref);
    markSent.mutate({ item, channel: "EMAIL" });
  }

  function book(item: Reminder) {
    router.push({
      pathname: "/(app)/work-orders/new",
      params: {
        title: item.title,
        customerId: item.customer.id,
        customerName: item.customer.name,
        assetId: item.asset.id,
        assetName: item.asset.name,
        scheduleId: item.scheduleId,
      },
    });
  }

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text variant="heading" style={{ flex: 1 }}>
          Da avvisare
        </Text>
        {waiting ? <Badge label={String(waiting)} tone="accent" /> : null}
      </View>
      {!items.length ? (
        <Text muted>Nessuna scadenza nei prossimi {list.data.settings.daysBefore} giorni.</Text>
      ) : (
        items.map((item) => {
          const due = dueLabel(item.dueAt);
          const done = Boolean(item.booked) || item.optedOut;
          return (
            <Card key={item.scheduleId} style={{ gap: 8, opacity: done ? 0.7 : 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text variant="heading" numberOfLines={1} style={{ flex: 1 }}>
                  {item.customer.name}
                </Text>
                <Badge label={due.text} tone={due.tone} />
              </View>
              <Text muted numberOfLines={2}>
                {item.title} · {item.asset.name}
              </Text>
              <Text variant="caption" style={{ color: item.optedOut ? theme.colors.danger : theme.colors.inkSoft }}>
                {statusLine(item)}
              </Text>
              {item.booked ? (
                <Button label="Apri l'intervento" tone="ghost" onPress={() => router.push(`/(app)/work-orders/${item.booked!.id}`)} />
              ) : !item.optedOut && writable ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {item.whatsappHref ? <Button label="WhatsApp" tone="secondary" style={{ flex: 1 }} onPress={() => void openWhatsapp(item)} /> : null}
                  {item.canEmail || item.mailtoHref ? (
                    <Button
                      label={item.emailedAt ? "Rimanda email" : "Email"}
                      tone="secondary"
                      style={{ flex: 1 }}
                      disabled={item.canEmail && Boolean(item.emailedAt)}
                      loading={email.isPending && email.variables?.scheduleId === item.scheduleId}
                      onPress={() => void sendEmail(item)}
                    />
                  ) : null}
                  <Button label="Prenota" style={{ flex: 1 }} onPress={() => book(item)} />
                </View>
              ) : null}
              {!item.whatsappHref && !item.canEmail && !item.mailtoHref && !done ? (
                <Text variant="caption" muted>
                  Aggiungi telefono o email al cliente per poterlo avvisare.
                </Text>
              ) : null}
            </Card>
          );
        })
      )}
      {email.error ? <Text style={{ color: theme.colors.danger }}>{email.error.message}</Text> : null}
    </View>
  );
}
