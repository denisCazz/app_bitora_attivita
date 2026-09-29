import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button, Card, Input, Screen, Text } from "@rapportini/ui";
import { http } from "../../../src/api/client";
import { queryClient } from "../../../src/api/query";
import { useAdminCatalog } from "../../../src/admin";

interface FieldRow { id: string; key: string; label: string | null; entity: { key: string }; visible: boolean | null; entityId?: string }
interface VocabRow { id: string; listKey: string; key: string; label: string; visible: boolean }
interface NavRow { id: string; placement: string; key: string; label: string | null; visible: boolean | null }
interface TermRow { id: string; termKey: string; value: string }
interface PermissionRow { key: string; label: string; description: string; section: string }
interface PlatformRow { key: string; intValue: number | null; textValue: string | null }

export default function AdminConfigScreen() {
  const catalog = useAdminCatalog();
  const [categoryId, setCategoryId] = useState("");
  const [moduleLabel, setModuleLabel] = useState("");
  const [moduleKey, setModuleKey] = useState("");
  const config = useQuery({
    queryKey: ["admin-config", categoryId],
    queryFn: () => http.get<{ fields: FieldRow[]; vocab: VocabRow[]; nav: NavRow[]; terms: TermRow[]; permissions: PermissionRow[]; platform: PlatformRow[] }>(`/admin/config${categoryId ? `?categoryId=${categoryId}` : ""}`),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin-config"] });
  const createModule = useMutation({
    mutationFn: () => http.post("/admin/modules", { key: moduleKey, label: moduleLabel }),
    onSuccess: async () => {
      setModuleLabel("");
      setModuleKey("");
      await refresh();
    },
  });
  const savePlatform = useMutation({
    mutationFn: (row: PlatformRow) => http.put("/admin/platform", row),
    onSuccess: refresh,
  });

  return (
    <Screen onRefresh={() => config.refetch()}>
      <Text variant="display">Configurazione</Text>
      <Text muted>Base della piattaforma, oppure una categoria. Il negozio sovrascrive da Impostazioni.</Text>
      <Input label="Id categoria (vuoto = base)" value={categoryId} onChangeText={setCategoryId} placeholder={catalog.data?.categories[0]?.id ?? ""} />
      <Card style={{ gap: 8 }}>
        <Text variant="title">Nuovo modulo</Text>
        <Input label="Chiave" value={moduleKey} onChangeText={setModuleKey} autoCapitalize="none" placeholder="deliveries" />
        <Input label="Nome" value={moduleLabel} onChangeText={setModuleLabel} placeholder="Consegne" />
        <Button label="Crea modulo ed entità" loading={createModule.isPending} onPress={() => createModule.mutate()} />
        {createModule.error ? <Text>{createModule.error.message}</Text> : null}
      </Card>
      <Card style={{ gap: 8 }}>
        <Text variant="title">Piattaforma</Text>
        {(config.data?.platform ?? []).map((row) => (
          <PlatformLine key={row.key} row={row} onSave={(next) => savePlatform.mutate(next)} />
        ))}
      </Card>
      <Card style={{ gap: 8 }}>
        <Text variant="title">Campi</Text>
        {(config.data?.fields ?? []).slice(0, 40).map((field) => (
          <Text key={field.id} variant="caption">{`${field.entity?.key ?? ""} · ${field.key} · ${field.label ?? "eredita"} · ${field.visible === false ? "nascosto" : "visibile"}`}</Text>
        ))}
      </Card>
      <Card style={{ gap: 8 }}>
        <Text variant="title">Vocabolari</Text>
        {(config.data?.vocab ?? []).slice(0, 40).map((item) => (
          <Text key={item.id} variant="caption">{`${item.listKey} · ${item.label}`}</Text>
        ))}
      </Card>
      <Card style={{ gap: 8 }}>
        <Text variant="title">Menu</Text>
        {(config.data?.nav ?? []).map((item) => (
          <Text key={item.id} variant="caption">{`${item.placement} · ${item.label ?? item.key}`}</Text>
        ))}
      </Card>
      <Card style={{ gap: 8 }}>
        <Text variant="title">Parole</Text>
        {(config.data?.terms ?? []).map((item) => (
          <Text key={item.id} variant="caption">{`${item.termKey}: ${item.value}`}</Text>
        ))}
      </Card>
      <Card style={{ gap: 8 }}>
        <Text variant="title">Permessi</Text>
        {(config.data?.permissions ?? []).map((item) => (
          <PermissionLine key={item.key} row={item} onSaved={refresh} />
        ))}
      </Card>
    </Screen>
  );
}

function PlatformLine({ row, onSave }: { row: PlatformRow; onSave: (row: PlatformRow) => void }) {
  const [text, setText] = useState(row.textValue ?? (row.intValue != null ? String(row.intValue) : ""));
  return (
    <>
      <Input label={row.key} value={text} onChangeText={setText} />
      <Button
        label="Salva"
        tone="secondary"
        onPress={() => onSave({ ...row, intValue: Number.isFinite(Number(text)) && text.trim() !== "" && !text.startsWith("#") ? Number(text) : row.intValue, textValue: Number.isFinite(Number(text)) && !text.startsWith("#") ? row.textValue : text })}
      />
    </>
  );
}

function PermissionLine({ row, onSaved }: { row: PermissionRow; onSaved: () => void }) {
  const [label, setLabel] = useState(row.label);
  const save = useMutation({
    mutationFn: () => http.patch(`/admin/permissions/${row.key}`, { label }),
    onSuccess: onSaved,
  });
  return (
    <>
      <Input label={row.key} value={label} onChangeText={setLabel} />
      <Button label="Aggiorna testo" tone="ghost" loading={save.isPending} onPress={() => save.mutate()} />
    </>
  );
}
