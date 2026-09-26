import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Badge, Button, Card, Input, Screen, Sheet, Text, useTheme } from "@rapportini/ui";
import { http } from "../../../src/api/client";
import { queryClient } from "../../../src/api/query";
import { monthly, useUpdateSeats } from "../../../src/billing";
import { Chip } from "../../../src/components/Chip";
import { EmployeeForm } from "../../../src/components/EmployeeForm";
import { QueryState } from "../../../src/components/States";
import { can, useManifest } from "../../../src/session";

interface TeamSeat {
  used: number;
  included: number;
  extra: number;
  capacity: number;
  priceCents: number;
  monthlyCents: number;
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
  roleId: string;
  roleName: string;
  status: "ACTIVE" | "INVITED" | "SUSPENDED";
  owner: boolean;
  self: boolean;
}

interface TeamInvite {
  id: string;
  email: string;
  roleName: string;
  token: string;
}

interface Role {
  id: string;
  name: string;
  isSystem: boolean;
}

interface Team {
  seats: TeamSeat;
  members: TeamMember[];
  invites: TeamInvite[];
  canManage: boolean;
}

function message(error: unknown) {
  return error instanceof Error ? error.message : "Operazione non riuscita";
}

export default function TeamScreen() {
  const theme = useTheme();
  const router = useRouter();
  const manifest = useManifest();
  const canBill = can(manifest.data, "settings.manage");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [confirmDrop, setConfirmDrop] = useState(false);
  const [passwordFor, setPasswordFor] = useState<TeamMember | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const team = useQuery({ queryKey: ["team"], queryFn: () => http.get<Team>("/team") });
  const roles = useQuery({ queryKey: ["roles"], queryFn: () => http.get<Role[]>("/roles") });
  const seats = useUpdateSeats();

  async function refresh() {
    await Promise.all([queryClient.invalidateQueries({ queryKey: ["team"] }), queryClient.invalidateQueries({ queryKey: ["roles"] })]);
  }

  const revoke = useMutation({
    mutationFn: (id: string) => http.del(`/team/invites/${id}`),
    onSuccess: refresh,
  });
  const changeRole = useMutation({
    mutationFn: (input: { id: string; roleId: string }) => http.patch(`/team/members/${input.id}`, { roleId: input.roleId }),
    onSuccess: refresh,
  });
  const reactivate = useMutation({
    mutationFn: (id: string) => http.post(`/team/members/${id}/reactivate`),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => http.del(`/team/members/${id}`),
    onSuccess: async () => {
      setConfirmId(null);
      await refresh();
    },
  });
  const resetPassword = useMutation({
    mutationFn: (input: { id: string; password: string }) => http.post(`/team/members/${input.id}/password`, { password: input.password }),
    onSuccess: () => {
      setPasswordFor(null);
      setNewPassword("");
    },
  });

  const data = team.data;
  const manage = Boolean(data?.canManage);
  const assignable = (roles.data ?? []).filter((role) => !role.isSystem);
  const full = Boolean(data && data.seats.used >= data.seats.capacity);
  const spare = data ? data.seats.extra - Math.max(0, data.seats.used - data.seats.included) : 0;
  const error = changeRole.error ?? remove.error ?? reactivate.error ?? revoke.error ?? seats.error;
  const summary = !data
    ? ""
    : data.seats.extra
      ? `${data.seats.used} collegati · ${data.seats.included} inclusi + ${data.seats.extra} a pagamento`
      : `${data.seats.used} di ${data.seats.included} inclusi`;

  function addSeat() {
    if (!data) return;
    setConfirmDrop(false);
    seats.mutate(data.seats.extra + 1);
  }

  function dropSeat() {
    if (!data || data.seats.extra === 0) return;
    if (spare > 0) {
      seats.mutate(data.seats.extra - 1);
      return;
    }
    setConfirmDrop(true);
  }

  function closePassword() {
    setPasswordFor(null);
    setNewPassword("");
    resetPassword.reset();
  }

  return (
    <Screen onBack={() => router.back()} backLabel="Indietro">
      <Text variant="display">Dipendenti</Text>
      <Text muted>Chi entra nell'app di questo negozio. Tre utenti sono inclusi. Dal quarto, 5€ al mese per utente.</Text>
      <QueryState isLoading={team.isLoading} error={team.error} refetch={() => void team.refetch()}>
        {data ? (
          <Card style={{ gap: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text variant="heading">{summary}</Text>
                <Text variant="caption" muted>
                  {data.seats.extra ? `${monthly(data.seats.monthlyCents)} per gli utenti extra` : `Poi ${monthly(data.seats.priceCents)} per utente`}
                </Text>
              </View>
              <Ionicons name="people-outline" size={22} color={theme.colors.accent} />
            </View>
            {canBill && manage && data.seats.extra > 0 && !confirmDrop ? (
              <Button tone="secondary" label={spare > 0 ? "Togli un posto non usato" : "Togli un posto"} loading={seats.isPending} onPress={dropSeat} />
            ) : null}
            {canBill && manage && full ? <Button label={`Aggiungi un utente · ${monthly(data.seats.priceCents)}`} loading={seats.isPending} onPress={addSeat} /> : null}
            {confirmDrop && data.seats.extra > 0 ? (
              <View style={{ gap: 8 }}>
                <Text variant="caption">L'ultimo utente aggiunto resta sospeso e non entra più, finché non ricompri il posto.</Text>
                <Button
                  tone="danger"
                  label="Conferma, togli il posto"
                  loading={seats.isPending}
                  onPress={() => {
                    setConfirmDrop(false);
                    seats.mutate(data.seats.extra - 1);
                  }}
                />
                <Button tone="ghost" label="Annulla" onPress={() => setConfirmDrop(false)} />
              </View>
            ) : null}
          </Card>
        ) : null}

        {data && !manage ? (
          <Text variant="caption" muted>
            Solo il titolare del negozio aggiunge, modifica o toglie le persone.
          </Text>
        ) : null}

        {data?.members.map((member) => (
          <Card key={member.id} style={{ gap: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="heading">
                  {member.name}
                  {member.self ? " (tu)" : ""}
                </Text>
                <Text variant="caption" muted>
                  {member.email}
                </Text>
              </View>
              {member.owner ? <Badge tone="accent" label="Titolare" /> : member.status === "SUSPENDED" ? <Badge tone="warning" label="Sospeso" /> : <Badge label={member.roleName} />}
            </View>
            {member.owner ? (
              <Text variant="caption" muted>
                Ha creato il negozio: gestisce le persone collegate.
              </Text>
            ) : manage ? (
              <View style={{ gap: 10 }}>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {assignable.map((role) => (
                    <Chip
                      key={role.id}
                      label={role.name}
                      active={member.roleId === role.id}
                      onPress={() => {
                        if (member.roleId !== role.id) changeRole.mutate({ id: member.id, roleId: role.id });
                      }}
                    />
                  ))}
                </View>
                {member.status === "SUSPENDED" ? (
                  <Button label="Riattiva" tone="secondary" loading={reactivate.isPending} onPress={() => reactivate.mutate(member.id)} />
                ) : null}
                {member.self ? null : <Button tone="soft" label="Imposta una nuova password" onPress={() => setPasswordFor(member)} />}
                {member.self ? null : confirmId === member.id ? (
                  <View style={{ gap: 8 }}>
                    <Button tone="danger" label="Conferma rimozione" loading={remove.isPending} onPress={() => remove.mutate(member.id)} />
                    <Button tone="ghost" label="Annulla" onPress={() => setConfirmId(null)} />
                  </View>
                ) : (
                  <Button tone="ghost" label="Rimuovi" onPress={() => setConfirmId(member.id)} />
                )}
              </View>
            ) : null}
          </Card>
        ))}

        {data?.invites.length ? <Text variant="title">Inviti aperti</Text> : null}
        {data?.invites.map((inviteRow) => (
          <Card key={inviteRow.id} style={{ gap: 8 }}>
            <Text variant="heading">{inviteRow.email}</Text>
            <Text variant="caption" muted>
              {inviteRow.roleName} · occupa un posto finché non lo annulli
            </Text>
            {manage ? <Button tone="ghost" label="Annulla invito" loading={revoke.isPending} onPress={() => revoke.mutate(inviteRow.id)} /> : null}
          </Card>
        ))}

        {manage && !full ? (
          <View style={{ gap: 10 }}>
            <Text variant="title">Aggiungi una persona</Text>
            <Text variant="caption" muted>
              Crei tu l'account: scegli email e password iniziale e gliele passi. Entra subito nel tuo negozio.
            </Text>
            <EmployeeForm roles={assignable} onCreated={refresh} />
          </View>
        ) : null}
        {manage && full ? (
          <Text variant="caption" muted>
            Hai usato tutti i posti. Aggiungi un utente qui sopra per collegare un'altra persona.
          </Text>
        ) : null}
        {error ? <Text style={{ color: theme.colors.danger }}>{message(error)}</Text> : null}
      </QueryState>

      <Sheet visible={Boolean(passwordFor)} title="Nuova password" onClose={closePassword}>
        <Text muted>Per {passwordFor?.name}. Le sessioni aperte sui suoi dispositivi vengono chiuse.</Text>
        <Input
          label="Nuova password"
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Almeno 8 caratteri"
          value={newPassword}
          onChangeText={setNewPassword}
          error={resetPassword.error ? message(resetPassword.error) : undefined}
        />
        <Button
          label="Salva password"
          disabled={newPassword.length < 8}
          loading={resetPassword.isPending}
          onPress={() => passwordFor && resetPassword.mutate({ id: passwordFor.id, password: newPassword })}
        />
        <Button tone="ghost" label="Annulla" onPress={closePassword} />
      </Sheet>
    </Screen>
  );
}
