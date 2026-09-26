import { employeeSchema } from "@rapportini/shared";
import { useState } from "react";
import { Share, View } from "react-native";
import { Button, Card, Input, Text, useTheme } from "@rapportini/ui";
import { http } from "../api/client";
import { Chip } from "./Chip";

export interface AssignableRole {
  id: string;
  name: string;
}

interface Created {
  name: string;
  email: string;
  password: string;
  roleName: string;
}

type Access = "employee" | "admin";

export function EmployeeForm({ roles, onCreated }: { roles: AssignableRole[]; onCreated?: () => void | Promise<void> }) {
  const theme = useTheme();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [access, setAccess] = useState<Access>("employee");
  const [roleId, setRoleId] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);
  const employeeRoles = roles.filter((role) => role.name !== "Amministratore");
  const chosenRole = roleId || employeeRoles[0]?.id || "";

  async function submit() {
    const parsed = employeeSchema.safeParse({ name, email, password, access, roleId: access === "employee" ? chosenRole : undefined });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0] ?? "root"), issue.message])));
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const result = await http.post<{ roleName: string }>("/team/members", parsed.data);
      setCreated({ name: parsed.data.name, email: parsed.data.email.toLowerCase(), password, roleName: result.roleName });
      setName("");
      setEmail("");
      setPassword("");
      await onCreated?.();
    } catch (caught) {
      setErrors({ root: caught instanceof Error ? caught.message : "Non è stato possibile aggiungere la persona" });
    } finally {
      setSaving(false);
    }
  }

  function shareCredentials() {
    if (!created) return;
    void Share.share({
      message: `Ciao ${created.name.split(" ")[0]}, ecco il tuo accesso all'app.\nEmail: ${created.email}\nPassword: ${created.password}\nAl primo accesso puoi cambiarla da Altro › Profilo.`,
    });
  }

  return (
    <View style={{ gap: 12 }}>
      {created ? (
        <Card style={{ gap: 8, borderColor: theme.colors.success, borderWidth: 1 }}>
          <Text variant="heading">
            {created.name} aggiunto come {created.roleName}
          </Text>
          <Text variant="caption" muted>
            Entra con {created.email} e la password che hai scelto. Mandagliela in privato: poi potrà cambiarla dal Profilo.
          </Text>
          <Button tone="soft" label="Condividi le credenziali" onPress={shareCredentials} />
        </Card>
      ) : null}
      <Input label="Nome e cognome" autoComplete="off" value={name} onChangeText={setName} error={errors.name} />
      <Input label="Email" autoCapitalize="none" autoComplete="off" keyboardType="email-address" value={email} onChangeText={setEmail} error={errors.email} />
      <Input
        label="Password iniziale"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        textContentType="none"
        placeholder="Almeno 8 caratteri"
        value={password}
        onChangeText={setPassword}
        error={errors.password}
      />
      <View style={{ gap: 6 }}>
        <Text variant="label" muted>
          Tipo di accesso
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Chip label="Dipendente" active={access === "employee"} onPress={() => setAccess("employee")} />
          <Chip label="Amministratore" active={access === "admin"} onPress={() => setAccess("admin")} />
        </View>
        <Text variant="caption" muted>
          {access === "admin"
            ? "Vede e gestisce tutto il negozio. Solo tu, come titolare, aggiungi o togli persone."
            : "Vede solo quello che il suo ruolo consente."}
        </Text>
      </View>
      {access === "employee" ? (
        <View style={{ gap: 6 }}>
          <Text variant="label" muted>
            Ruolo
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {employeeRoles.map((role) => (
              <Chip key={role.id} label={role.name} active={chosenRole === role.id} onPress={() => setRoleId(role.id)} />
            ))}
          </View>
          {errors.roleId ? <Text style={{ color: theme.colors.danger }}>{errors.roleId}</Text> : null}
        </View>
      ) : null}
      {errors.root ? <Text style={{ color: theme.colors.danger }}>{errors.root}</Text> : null}
      <Button label={access === "admin" ? "Aggiungi amministratore" : "Aggiungi dipendente"} loading={saving} onPress={() => void submit()} />
    </View>
  );
}
