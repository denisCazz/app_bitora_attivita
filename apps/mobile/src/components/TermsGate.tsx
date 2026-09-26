import { useRouter } from "expo-router";
import { useState } from "react";
import { Modal, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Backdrop, Button, Text, useTheme } from "@rapportini/ui";
import { acceptTerms, signOut, useAccount } from "../account";
import { LegalConsents } from "./LegalConsents";

/** Blocks the app until the current Terms and Privacy notice are accepted. */
export function TermsGate() {
  const account = useAccount();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [values, setValues] = useState({ acceptTerms: false, approveClauses: false });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const me = account.data;
  if (!me?.needsTerms) return null;

  async function accept() {
    if (!me) return;
    setSaving(true);
    setError(null);
    try {
      await acceptTerms(me.legalVersion);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Non è stato possibile salvare");
    } finally {
      setSaving(false);
    }
  }

  async function leave() {
    await signOut();
    router.replace("/(auth)/login");
  }

  return (
    <Modal visible animationType="fade" onRequestClose={() => undefined}>
      <View style={{ flex: 1, backgroundColor: theme.colors.paper }}>
        <Backdrop />
        <ScrollView contentContainerStyle={{ padding: theme.space.lg, paddingTop: insets.top + theme.space.xl, paddingBottom: insets.bottom + theme.space.lg, gap: theme.space.lg }}>
          <Text variant="display">{me.termsAcceptedAt ? "Abbiamo aggiornato i documenti" : "Prima di continuare"}</Text>
          <Text muted>
            {me.termsAcceptedAt
              ? "Termini di servizio e Informativa privacy sono cambiati. Leggili e accettali per continuare a usare Bitora."
              : "Per usare Bitora serve accettare Termini di servizio e Informativa privacy."}
          </Text>
          <LegalConsents
            acceptTerms={values.acceptTerms}
            approveClauses={values.approveClauses}
            onChange={(key, value) => setValues((current) => ({ ...current, [key]: value }))}
          />
          {error ? <Text style={{ color: theme.colors.danger }}>{error}</Text> : null}
          <Button label="Accetto e continuo" disabled={!values.acceptTerms || !values.approveClauses} loading={saving} onPress={() => void accept()} />
          <Button label="Non accetto ed esco" tone="ghost" onPress={() => void leave()} />
          <Text variant="caption" muted>
            Se non accetti puoi comunque eliminare l'account e scaricare i tuoi dati dalla pagina web indicata nell'Informativa.
          </Text>
        </ScrollView>
      </View>
    </Modal>
  );
}
