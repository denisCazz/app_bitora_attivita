import { useRouter } from "expo-router";
import { roleSchema } from "@rapportini/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button, Card, Input, Screen, Text, useTheme } from "@rapportini/ui";
import { http } from "../../../src/api/client";
import { queryClient } from "../../../src/api/query";
import { PermissionToggles } from "../../../src/components/PermissionToggles";
import { QueryState } from "../../../src/components/States";
import { useManifest } from "../../../src/session";

interface Role { id: string; name: string; permissions: string[]; isSystem: boolean }

export default function RolesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const manifest = useManifest();
  const [name, setName] = useState("");
  const roles = useQuery({ queryKey: ["roles"], queryFn: () => http.get<Role[]>("/roles") });
  const save = useMutation({
    mutationFn: (role: Role) => http.patch(`/roles/${role.id}`, { name: role.name, permissions: role.permissions }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["roles"] }),
  });
  const create = useMutation({
    mutationFn: () => http.post("/roles", roleSchema.parse({ name, permissions: ["dashboard.view"] })),
    onSuccess: async () => {
      setName("");
      await queryClient.invalidateQueries({ queryKey: ["roles"] });
    },
  });
  const catalog = manifest.data?.modules.map((module) => ({ key: module.key, label: module.label })) ?? null;
  const message = (error: unknown) => (error instanceof Error ? error.message : "Operazione non riuscita");

  function toggle(role: Role, permission: string) {
    const permissions = role.permissions.includes(permission) ? role.permissions.filter((item) => item !== permission) : [...role.permissions, permission];
    save.mutate({ ...role, permissions });
  }

  return (
    <Screen onBack={() => router.back()} backLabel="Impostazioni">
      <Text variant="display">Ruoli</Text>
      <Text muted>Acceso: quella persona può farlo. Spento: non può. I gruppi sono le sezioni del negozio, con i nomi che usi tu.</Text>
      <QueryState isLoading={roles.isLoading || manifest.isLoading} error={roles.error} refetch={() => void roles.refetch()}>
        {roles.data?.map((role) => (
          <Card key={role.id}>
            <Text variant="heading">{role.name}</Text>
            <PermissionToggles
              selected={role.permissions}
              catalog={catalog}
              locked={role.isSystem ? ["settings.manage", "team.manage"] : []}
              disabled={save.isPending}
              onToggle={(permission) => toggle(role, permission)}
            />
          </Card>
        ))}
        {save.isError ? <Text style={{ color: theme.colors.danger }}>{message(save.error)}</Text> : null}
        <Input label="Nuovo ruolo" value={name} onChangeText={setName} placeholder="Es. Tecnico, Sala, Magazzino" />
        {create.isError ? <Text style={{ color: theme.colors.danger }}>{message(create.error)}</Text> : null}
        <Button label="Crea ruolo" loading={create.isPending} onPress={() => create.mutate()} />
      </QueryState>
    </Screen>
  );
}
