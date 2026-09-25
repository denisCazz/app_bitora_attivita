import { assetSchema, customerSchema } from "@rapportini/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { View } from "react-native";
import { Button, Input, Sheet, Text } from "@rapportini/ui";
import { http } from "../api/client";
import { queryClient } from "../api/query";
import { fromLocalInput } from "../format";
import { useManifest } from "../session";
import { Chip } from "./Chip";
import { CustomFields } from "./CustomFields";
import { RecordPicker } from "./RecordPicker";

type Status = "DRAFT" | "SCHEDULED" | "IN_PROGRESS" | "DONE" | "CANCELLED";

export interface WorkOrderDraft {
  title: string;
  description: string;
  status: Status | "";
  scheduledAt: string;
  customerId: string | null;
  assetId: string | null;
  assigneeId: string | null;
  custom: Record<string, string>;
}

export const emptyWorkOrder: WorkOrderDraft = {
  title: "",
  description: "",
  status: "",
  scheduledAt: "",
  customerId: null,
  assetId: null,
  assigneeId: null,
  custom: {},
};

const STATUSES: Array<{ id: Status; label: string }> = [
  { id: "DRAFT", label: "Bozza" },
  { id: "SCHEDULED", label: "In programma" },
  { id: "IN_PROGRESS", label: "In corso" },
  { id: "DONE", label: "Fatto" },
  { id: "CANCELLED", label: "Annullato" },
];

export function workOrderBody(draft: WorkOrderDraft) {
  const scheduledAt = fromLocalInput(draft.scheduledAt);
  if (draft.scheduledAt.trim() && !scheduledAt) throw new Error("Data non valida. Usa 2026-09-26T09:00");
  return {
    title: draft.title.trim(),
    description: draft.description.trim() || null,
    status: draft.status || undefined,
    scheduledAt,
    customerId: draft.customerId,
    assetId: draft.assetId,
    assigneeId: draft.assigneeId,
    customFields: draft.custom,
  };
}

export function WorkOrderForm({ value, onChange }: { value: WorkOrderDraft; onChange: (next: WorkOrderDraft) => void }) {
  const manifest = useManifest();
  const terms = manifest.data?.tenant.terminology;
  const [customerQ, setCustomerQ] = useState("");
  const [assetQ, setAssetQ] = useState("");
  const [assigneeQ, setAssigneeQ] = useState("");
  const [creating, setCreating] = useState<"customer" | "asset" | null>(null);
  const [customerDraft, setCustomerDraft] = useState({ name: "", phone: "", email: "", address: "", city: "", notes: "" });
  const [assetDraft, setAssetDraft] = useState({ name: "", type: "", brand: "", model: "", serialNumber: "", notes: "", installedAt: "" });

  const customers = useQuery({
    queryKey: ["customers", customerQ],
    queryFn: () => http.get<Array<{ id: string; name: string; city?: string | null }>>(`/customers?q=${encodeURIComponent(customerQ)}`),
  });
  const assets = useQuery({
    queryKey: ["assets", assetQ],
    queryFn: () =>
      http.get<Array<{ id: string; name: string; type?: string | null; customer?: { id: string; name: string } | null }>>(`/assets?q=${encodeURIComponent(assetQ)}`),
    retry: false,
  });
  const team = useQuery({
    queryKey: ["team"],
    queryFn: () => http.get<{ members: Array<{ userId: string; name: string; roleName: string }> }>("/team"),
    retry: false,
  });

  const createCustomer = useMutation({
    mutationFn: () => http.post<{ id: string }>("/customers", customerSchema.parse(customerDraft)),
    onSuccess: async (created) => {
      onChange({ ...value, customerId: created.id });
      setCreating(null);
      setCustomerDraft({ name: "", phone: "", email: "", address: "", city: "", notes: "" });
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
  });
  const createAsset = useMutation({
    mutationFn: () => {
      const installedAt = fromLocalInput(assetDraft.installedAt);
      if (assetDraft.installedAt.trim() && !installedAt) throw new Error("Data installazione non valida");
      return http.post<{ id: string }>(
        "/assets",
        assetSchema.parse({
          ...assetDraft,
          customerId: value.customerId,
          installedAt,
        }),
      );
    },
    onSuccess: async (created) => {
      onChange({ ...value, assetId: created.id });
      setCreating(null);
      setAssetDraft({ name: "", type: "", brand: "", model: "", serialNumber: "", notes: "", installedAt: "" });
      await queryClient.invalidateQueries({ queryKey: ["assets"] });
    },
  });

  const people =
    team.data?.members ??
    (manifest.data ? [{ userId: manifest.data.user.id, name: manifest.data.user.name, roleName: manifest.data.role.name }] : []);

  return (
    <View style={{ gap: 12 }}>
      <Input label="Titolo" value={value.title} onChangeText={(title) => onChange({ ...value, title })} />
      <Input label="Note" value={value.description} onChangeText={(description) => onChange({ ...value, description })} multiline />
      <Input label="Quando" value={value.scheduledAt} onChangeText={(scheduledAt) => onChange({ ...value, scheduledAt })} />
      <Text variant="label">Stato</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {STATUSES.map((status) => (
          <Chip key={status.id} label={status.label} active={value.status === status.id} onPress={() => onChange({ ...value, status: value.status === status.id ? "" : status.id })} />
        ))}
      </View>
      <RecordPicker
        label={terms?.customer ?? "Cliente"}
        query={customerQ}
        onQuery={setCustomerQ}
        options={(customers.data ?? []).map((customer) => ({ id: customer.id, title: customer.name, subtitle: customer.city ?? undefined }))}
        value={value.customerId}
        onChange={(customerId) => onChange({ ...value, customerId })}
        onCreate={() => setCreating("customer")}
        createLabel={`Nuovo ${(terms?.customer ?? "cliente").toLowerCase()}`}
      />
      {customers.error ? <Text>{customers.error.message}</Text> : null}
      <RecordPicker
        label={terms?.asset ?? "Impianto"}
        query={assetQ}
        onQuery={setAssetQ}
        options={(assets.data ?? []).map((asset) => ({ id: asset.id, title: asset.name, subtitle: [asset.type, asset.customer?.name].filter(Boolean).join(" · ") || undefined }))}
        value={value.assetId}
        onChange={(assetId) => onChange({ ...value, assetId })}
        onCreate={assets.error ? undefined : () => setCreating("asset")}
        createLabel={`Aggiungi ${(terms?.asset ?? "impianto").toLowerCase()}`}
      />
      {assets.error ? <Text>{assets.error.message}</Text> : null}
      <RecordPicker
        label="Tecnico"
        query={assigneeQ}
        onQuery={setAssigneeQ}
        options={people.map((member) => ({ id: member.userId, title: member.name, subtitle: member.roleName }))}
        value={value.assigneeId}
        onChange={(assigneeId) => onChange({ ...value, assigneeId })}
      />
      <CustomFields entity="WORK_ORDER" fields={manifest.data?.customFields ?? []} values={value.custom} onChange={(custom) => onChange({ ...value, custom })} />

      <Sheet visible={creating === "customer"} title={`Nuovo ${(terms?.customer ?? "cliente").toLowerCase()}`} onClose={() => setCreating(null)}>
        <Input label="Nome" value={customerDraft.name} onChangeText={(name) => setCustomerDraft({ ...customerDraft, name })} />
        <Input label="Telefono" value={customerDraft.phone} onChangeText={(phone) => setCustomerDraft({ ...customerDraft, phone })} />
        <Input label="Email" value={customerDraft.email} onChangeText={(email) => setCustomerDraft({ ...customerDraft, email })} />
        <Input label="Indirizzo" value={customerDraft.address} onChangeText={(address) => setCustomerDraft({ ...customerDraft, address })} />
        <Input label="Città" value={customerDraft.city} onChangeText={(city) => setCustomerDraft({ ...customerDraft, city })} />
        <Input label="Note" value={customerDraft.notes} onChangeText={(notes) => setCustomerDraft({ ...customerDraft, notes })} multiline />
        {createCustomer.error ? <Text>{createCustomer.error.message}</Text> : null}
        <Button label="Crea e seleziona" loading={createCustomer.isPending} onPress={() => createCustomer.mutate()} />
      </Sheet>
      <Sheet visible={creating === "asset"} title={`Nuovo ${(terms?.asset ?? "impianto").toLowerCase()}`} onClose={() => setCreating(null)}>
        <Input label="Nome" value={assetDraft.name} onChangeText={(name) => setAssetDraft({ ...assetDraft, name })} />
        <Input label="Tipo" value={assetDraft.type} onChangeText={(type) => setAssetDraft({ ...assetDraft, type })} />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {(manifest.data?.tenant.assetTypes ?? []).map((type) => (
            <Chip key={type} label={type} active={assetDraft.type === type} onPress={() => setAssetDraft({ ...assetDraft, type: assetDraft.type === type ? "" : type })} />
          ))}
        </View>
        <Input label="Marca" value={assetDraft.brand} onChangeText={(brand) => setAssetDraft({ ...assetDraft, brand })} />
        <Input label="Modello" value={assetDraft.model} onChangeText={(model) => setAssetDraft({ ...assetDraft, model })} />
        <Input label="Matricola" value={assetDraft.serialNumber} onChangeText={(serialNumber) => setAssetDraft({ ...assetDraft, serialNumber })} />
        <Input label="Installato il" value={assetDraft.installedAt} onChangeText={(installedAt) => setAssetDraft({ ...assetDraft, installedAt })} />
        <Input label="Note" value={assetDraft.notes} onChangeText={(notes) => setAssetDraft({ ...assetDraft, notes })} multiline />
        <Text muted>Verrà collegato al cliente selezionato, se ne hai scelto uno.</Text>
        {createAsset.error ? <Text>{createAsset.error.message}</Text> : null}
        <Button label="Crea e seleziona" loading={createAsset.isPending} onPress={() => createAsset.mutate()} />
      </Sheet>
    </View>
  );
}
