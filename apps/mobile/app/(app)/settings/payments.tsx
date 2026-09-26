import { PAYMENT_PROVIDER_LABEL, paymentConfigSchema, type PaymentProvider } from "@rapportini/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Button, Input, Screen, Text, useTheme } from "@rapportini/ui";
import { http } from "../../../src/api/client";
import { queryClient } from "../../../src/api/query";
import { Chip } from "../../../src/components/Chip";
import { QueryState } from "../../../src/components/States";

interface PaymentSettings {
  provider: PaymentProvider | null;
  revolut: string | null;
  satispay: string | null;
  stripeConfigured: boolean;
  ready: boolean;
}

const PROVIDERS: Array<PaymentProvider | null> = ["STRIPE", "REVOLUT", "SATISPAY", null];

export default function PaymentSettingsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const [provider, setProvider] = useState<PaymentProvider | null>(null);
  const [revolut, setRevolut] = useState("");
  const [satispay, setSatispay] = useState("");
  const [stripeKey, setStripeKey] = useState("");
  const [clearKey, setClearKey] = useState(false);
  const [ready, setReady] = useState(false);

  const settings = useQuery({
    queryKey: ["payment-settings"],
    queryFn: () => http.get<PaymentSettings>("/settings/payments"),
  });

  useEffect(() => {
    if (!settings.data || ready) return;
    setProvider(settings.data.provider);
    setRevolut(settings.data.revolut ?? "");
    setSatispay(settings.data.satispay ?? "");
    setReady(true);
  }, [settings.data, ready]);

  const save = useMutation({
    mutationFn: () => {
      const body: { provider: PaymentProvider | null; revolut: string | null; satispay: string | null; stripeSecretKey?: string } = {
        provider,
        revolut: revolut.trim() || null,
        satispay: satispay.trim() || null,
      };
      if (stripeKey.trim()) body.stripeSecretKey = stripeKey.trim();
      else if (clearKey) body.stripeSecretKey = "";
      return http.put("/settings/payments", paymentConfigSchema.parse(body));
    },
    onSuccess: async () => {
      setStripeKey("");
      setClearKey(false);
      await queryClient.invalidateQueries({ queryKey: ["payment-settings"] });
      await queryClient.invalidateQueries({ queryKey: ["payments"] });
    },
  });

  return (
    <Screen onBack={() => router.back()} backLabel="Impostazioni">
      <Text variant="display">Incassi</Text>
      <Text muted>Un solo metodo. I soldi arrivano sul tuo conto, non su Bitora.</Text>
      <QueryState isLoading={settings.isLoading} error={settings.error} refetch={() => settings.refetch()}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {PROVIDERS.map((item) => (
            <Chip key={item ?? "none"} label={item ? PAYMENT_PROVIDER_LABEL[item] : "Nessuno"} active={provider === item} onPress={() => setProvider(item)} />
          ))}
        </View>
        {provider === "STRIPE" ? (
          <>
            <Text muted>Incolla una chiave segreta o ristretta del tuo account Stripe, con permesso di creare pagamenti. Il cliente paga con carta.</Text>
            {settings.data?.stripeConfigured && !clearKey ? <Text>Chiave salvata. Incollane un'altra solo se vuoi sostituirla.</Text> : null}
            <Input label="Chiave Stripe" value={stripeKey} onChangeText={setStripeKey} placeholder="sk_live_… o rk_live_…" secureTextEntry autoCapitalize="none" autoCorrect={false} />
            {settings.data?.stripeConfigured ? (
              <Button label={clearKey ? "La chiave verrà rimossa" : "Rimuovi la chiave"} tone="ghost" onPress={() => setClearKey((value) => !value)} />
            ) : null}
          </>
        ) : null}
        {provider === "REVOLUT" ? (
          <>
            <Text muted>Nome utente di revolut.me, oppure un link di pagamento Revolut già pronto.</Text>
            <Input label="Revolut" value={revolut} onChangeText={setRevolut} placeholder="oficina oppure https://revolut.me/oficina" autoCapitalize="none" autoCorrect={false} />
          </>
        ) : null}
        {provider === "SATISPAY" ? (
          <>
            <Text muted>Link di pagamento Satispay, oppure il numero a cui il cliente deve inviare i soldi.</Text>
            <Input label="Satispay" value={satispay} onChangeText={setSatispay} placeholder="https://… oppure 333…" autoCapitalize="none" autoCorrect={false} />
          </>
        ) : null}
        {save.isSuccess ? <Text style={{ color: theme.colors.success }}>Salvato.</Text> : null}
        {save.error ? <Text style={{ color: theme.colors.danger }}>{save.error instanceof Error ? save.error.message : "Non salvato"}</Text> : null}
        <Button label="Salva" loading={save.isPending} onPress={() => save.mutate()} />
      </QueryState>
    </Screen>
  );
}
