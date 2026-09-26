import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Switch, View } from "react-native";
import { Badge, Button, Card, Input, ListItem, Screen, Sheet, Text, useTheme } from "@rapportini/ui";
import { downloadMyData, setAiConsent, signOut, useAccount } from "../../src/account";
import { api } from "../../src/api/client";
import { queryClient } from "../../src/api/query";
import { biometricLabel, setBiometricEnabled, useBiometricLock } from "../../src/auth/biometric";
import { forgetRememberedUser, useAuth } from "../../src/auth/store";
import { QueryState } from "../../src/components/States";
import { t } from "../../src/i18n";
import { openLegal } from "../../src/legal";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function message(reason: unknown, fallback: string) {
  return reason instanceof Error ? reason.message : fallback;
}

const PROVIDER_NAME = { apple: "Apple", google: "Google" } as const;

export default function ProfileScreen() {
  const theme = useTheme();
  const router = useRouter();
  const account = useAccount();
  const setSession = useAuth((state) => state.setSession);
  const me = account.data;

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [profileNote, setProfileNote] = useState<{ ok: boolean; text: string } | null>(null);

  const [passwordOpen, setPasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [leaving, setLeaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [dataNote, setDataNote] = useState<string | null>(null);

  const biometricEnabled = useBiometricLock((state) => state.enabled);
  const [biometric, setBiometric] = useState<string | null>(null);
  useEffect(() => {
    void biometricLabel().then(setBiometric);
  }, []);

  async function exportData() {
    setExporting(true);
    setDataNote(null);
    try {
      await downloadMyData();
    } catch (reason) {
      setDataNote(message(reason, "Non è stato possibile preparare il file"));
    } finally {
      setExporting(false);
    }
  }

  async function revokeAi() {
    setAiBusy(true);
    setDataNote(null);
    try {
      await setAiConsent(false);
    } catch (reason) {
      setDataNote(message(reason, "Non è stato possibile revocare il consenso"));
    } finally {
      setAiBusy(false);
    }
  }

  useEffect(() => {
    if (!me) return;
    setName(me.name);
    setEmail(me.email);
  }, [me]);

  const emailChanged = Boolean(me) && email.trim().toLowerCase() !== me?.email;
  const needsEmailPassword = emailChanged && Boolean(me?.hasPassword);
  const dirty = Boolean(me) && (name.trim() !== me?.name || emailChanged);

  async function saveProfile() {
    setSaving(true);
    setProfileNote(null);
    try {
      await api("PATCH", "/me", { name: name.trim(), email: email.trim(), currentPassword: needsEmailPassword ? emailPassword : undefined }, { force: true });
      setEmailPassword("");
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["account"] }), queryClient.invalidateQueries({ queryKey: ["manifest"] })]);
      setProfileNote({ ok: true, text: "Profilo aggiornato" });
    } catch (reason) {
      setProfileNote({ ok: false, text: message(reason, "Non è stato possibile salvare") });
    } finally {
      setSaving(false);
    }
  }

  function closePassword() {
    setPasswordOpen(false);
    setCurrentPassword("");
    setNewPassword("");
    setRepeatPassword("");
    setPasswordError(null);
  }

  async function changePassword() {
    if (newPassword.length < 8) return setPasswordError("La nuova password deve avere almeno 8 caratteri");
    if (newPassword !== repeatPassword) return setPasswordError("Le due password non coincidono");
    setChangingPassword(true);
    setPasswordError(null);
    try {
      const session = await api<{ accessToken: string; refreshToken: string }>(
        "POST",
        "/me/password",
        { currentPassword: me?.hasPassword ? currentPassword : undefined, newPassword },
        { force: true },
      );
      await setSession(session.accessToken, session.refreshToken);
      closePassword();
      await queryClient.invalidateQueries({ queryKey: ["account"] });
      setProfileNote({ ok: true, text: me?.hasPassword ? "Password cambiata. Gli altri dispositivi dovranno rientrare." : "Password impostata: ora puoi entrare anche con email e password." });
    } catch (reason) {
      setPasswordError(message(reason, "Non è stato possibile cambiare la password"));
    } finally {
      setChangingPassword(false);
    }
  }

  async function logout() {
    setLeaving(true);
    await signOut();
    router.replace("/(auth)/login");
  }

  function closeDelete() {
    setDeleteOpen(false);
    setDeletePassword("");
    setDeleteError(null);
  }

  async function deleteAccount() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await api("DELETE", "/me", { password: me?.hasPassword ? deletePassword : undefined }, { force: true });
      await forgetRememberedUser();
      await signOut({ revoke: false });
      router.replace("/(auth)/login");
      Alert.alert("Account eliminato", "Il tuo account e i relativi dati sono stati cancellati.");
    } catch (reason) {
      setDeleteError(message(reason, "Non è stato possibile eliminare l'account"));
      setDeleting(false);
    }
  }

  const owned = me?.ownedTenants ?? [];
  const affectedPeople = owned.reduce((total, tenant) => total + tenant.otherMembers, 0);

  return (
    <Screen onBack={() => router.back()} backLabel="Altro" onRefresh={() => account.refetch()}>
      <Text variant="display">Profilo</Text>

      <QueryState isLoading={account.isLoading} error={account.error} refetch={() => void account.refetch()}>
        {me ? (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
              <View
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  backgroundColor: theme.colors.accentSoft,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text variant="title" style={{ color: theme.colors.accent }}>
                  {initials(me.name) || "?"}
                </Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="title">{me.name}</Text>
                <Text muted>{me.email}</Text>
                {me.signInWith.length ? (
                  <Text variant="caption" muted>
                    Accedi con {me.signInWith.map((provider) => PROVIDER_NAME[provider]).join(" e ")}
                  </Text>
                ) : null}
                {me.demo ? <Badge tone="warning" label="Account demo" /> : null}
              </View>
            </View>

            <View style={{ gap: 8 }}>
              <Text variant="title">Dati personali</Text>
              <Card style={{ gap: 12 }}>
                <Input label={t("name")} value={name} onChangeText={setName} editable={!me.demo} autoComplete="name" textContentType="name" />
                <Input
                  label={t("email")}
                  value={email}
                  onChangeText={setEmail}
                  editable={!me.demo}
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  textContentType="emailAddress"
                />
                {needsEmailPassword ? (
                  <Input
                    label="Password attuale (per confermare la nuova email)"
                    value={emailPassword}
                    onChangeText={setEmailPassword}
                    secureTextEntry
                    autoComplete="current-password"
                    textContentType="password"
                  />
                ) : null}
                {profileNote ? (
                  <Text variant="caption" style={{ color: profileNote.ok ? theme.colors.success : theme.colors.danger }}>
                    {profileNote.text}
                  </Text>
                ) : null}
                {me.demo ? (
                  <Text variant="caption" muted>
                    Il profilo demo è condiviso e non si modifica.
                  </Text>
                ) : (
                  <Button
                    label={t("save")}
                    disabled={!dirty || name.trim().length < 2 || (needsEmailPassword && !emailPassword)}
                    loading={saving}
                    onPress={() => void saveProfile()}
                  />
                )}
              </Card>
            </View>

            <Card style={{ paddingVertical: 4 }}>
              <ListItem
                title={me.hasPassword ? "Cambia password" : "Imposta una password"}
                subtitle={me.hasPassword ? "Chiude la sessione sugli altri dispositivi" : "Per entrare anche con email e password"}
                leading={<Ionicons name="key-outline" size={20} color={theme.colors.accent} />}
                onPress={me.demo ? undefined : () => setPasswordOpen(true)}
              />
              {biometric && !me.demo ? (
                <ListItem
                  title={`Sblocca con ${biometric}`}
                  subtitle="Chiesto all'apertura dell'app"
                  leading={<Ionicons name="finger-print-outline" size={20} color={theme.colors.accent} />}
                  trailing={<Switch value={biometricEnabled} onValueChange={(value) => void setBiometricEnabled(value)} />}
                />
              ) : null}
            </Card>

            {me.memberships.length ? (
              <View style={{ gap: 8 }}>
                <Text variant="title">I tuoi negozi</Text>
                <Card style={{ paddingVertical: 4 }}>
                  {me.memberships.map((membership) => (
                    <ListItem
                      key={membership.tenantId}
                      title={membership.tenantName}
                      subtitle={membership.roleName}
                      leading={<Ionicons name="storefront-outline" size={20} color={theme.colors.accent} />}
                      trailing={membership.owner ? <Badge tone="accent" label="Titolare" /> : undefined}
                    />
                  ))}
                </Card>
              </View>
            ) : null}

            <View style={{ gap: 8 }}>
              <Text variant="title">Privacy e dati</Text>
              <Card style={{ paddingVertical: 4 }}>
                <ListItem
                  title="Scarica i miei dati"
                  subtitle={
                    exporting
                      ? "Preparo il file…"
                      : owned.length
                        ? "File JSON con il tuo profilo e tutti i dati dei tuoi negozi"
                        : "File JSON con tutti i dati del tuo profilo"
                  }
                  leading={<Ionicons name="download-outline" size={20} color={theme.colors.accent} />}
                  onPress={exporting ? undefined : () => void exportData()}
                />
                <ListItem
                  title="Assistente IA"
                  subtitle={
                    me.aiConsentAt
                      ? `Consenso dato il ${new Date(me.aiConsentAt).toLocaleDateString("it-IT")} · tocca per revocarlo`
                      : "Consenso non dato: l'assistente te lo chiede al primo uso"
                  }
                  leading={<Ionicons name="sparkles-outline" size={20} color={theme.colors.accent} />}
                  trailing={me.aiConsentAt ? <Badge tone="success" label="Attivo" /> : <Badge label="Spento" />}
                  onPress={me.aiConsentAt && !aiBusy ? () => void revokeAi() : undefined}
                />
                <ListItem
                  title="Informativa privacy"
                  leading={<Ionicons name="shield-outline" size={20} color={theme.colors.accent} />}
                  onPress={() => void openLegal("privacy")}
                />
                <ListItem
                  title="Termini di servizio"
                  subtitle={me.termsAcceptedAt ? `Accettati il ${new Date(me.termsAcceptedAt).toLocaleDateString("it-IT")}` : undefined}
                  leading={<Ionicons name="document-text-outline" size={20} color={theme.colors.accent} />}
                  onPress={() => void openLegal("terms")}
                />
                <ListItem
                  title="Note legali"
                  leading={<Ionicons name="business-outline" size={20} color={theme.colors.accent} />}
                  onPress={() => void openLegal("imprint")}
                />
              </Card>
              {dataNote ? (
                <Text variant="caption" style={{ color: theme.colors.danger }}>
                  {dataNote}
                </Text>
              ) : null}
            </View>

            <Button label={t("logout")} tone="secondary" loading={leaving} onPress={() => void logout()} />

            <View style={{ gap: 8, marginTop: 8 }}>
              <Text variant="title">Elimina account</Text>
              <Text muted>
                Cancella per sempre il tuo account e i tuoi dati personali. Prima puoi scaricarli da «Scarica i miei dati».
                {owned.length ? " Vengono eliminati anche i negozi di cui sei titolare, con tutti i loro dati, e disdetti i relativi abbonamenti." : ""}
              </Text>
              {me.demo ? (
                <Text variant="caption" muted>
                  Gli account demo non si possono eliminare. Crea un tuo account per usare questa funzione.
                </Text>
              ) : (
                <Button label="Elimina account" tone="danger" onPress={() => setDeleteOpen(true)} />
              )}
            </View>
          </>
        ) : null}
      </QueryState>

      <Sheet visible={passwordOpen} title={me?.hasPassword ? "Cambia password" : "Imposta una password"} onClose={closePassword}>
        {me?.hasPassword ? (
          <Input label="Password attuale" value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry autoComplete="current-password" textContentType="password" />
        ) : null}
        <Input label="Nuova password" value={newPassword} onChangeText={setNewPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" />
        <Input
          label="Ripeti la nuova password"
          value={repeatPassword}
          onChangeText={setRepeatPassword}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          error={passwordError ?? undefined}
        />
        <Button
          label={me?.hasPassword ? "Cambia password" : "Imposta password"}
          disabled={(me?.hasPassword && !currentPassword) || !newPassword}
          loading={changingPassword}
          onPress={() => void changePassword()}
        />
      </Sheet>

      <Sheet visible={deleteOpen} title="Eliminare l'account?" onClose={closeDelete}>
        <Text>L'operazione è immediata e non si può annullare. Verranno cancellati:</Text>
        <View style={{ gap: 6 }}>
          <Text muted>• il tuo profilo, email e password</Text>
          <Text muted>• i tuoi accessi, turni e notifiche</Text>
          {owned.map((tenant) => (
            <Text key={tenant.id} muted>
              • il negozio «{tenant.name}» con clienti, schede, foto e magazzino
            </Text>
          ))}
        </View>
        {owned.length ? (
          <Card style={{ gap: 6 }}>
            <Text variant="heading">Abbonamenti</Text>
            <Text variant="caption" muted>
              I moduli e gli utenti a pagamento vengono disdetti subito, senza altri addebiti. Le fatture già emesse restano conservate per obblighi fiscali.
            </Text>
            {affectedPeople ? (
              <Text variant="caption" style={{ color: theme.colors.danger }}>
                {affectedPeople === 1 ? "1 persona del tuo team perderà l'accesso." : `${affectedPeople} persone del tuo team perderanno l'accesso.`}
              </Text>
            ) : null}
          </Card>
        ) : null}
        {me?.hasPassword ? (
          <Input
            label="Inserisci la password per confermare"
            value={deletePassword}
            onChangeText={setDeletePassword}
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            error={deleteError ?? undefined}
          />
        ) : deleteError ? (
          <Text style={{ color: theme.colors.danger }}>{deleteError}</Text>
        ) : null}
        <Button label="Elimina definitivamente" tone="danger" disabled={me?.hasPassword && !deletePassword} loading={deleting} onPress={() => void deleteAccount()} />
        <Button label="Annulla" tone="ghost" onPress={closeDelete} />
      </Sheet>
    </Screen>
  );
}
