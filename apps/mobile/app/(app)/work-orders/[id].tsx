import { sparePartSchema } from "@rapportini/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Button, Card, Input, Screen, Sheet, Text } from "@rapportini/ui";
import { API_URL, http } from "../../../src/api/client";
import { queryClient } from "../../../src/api/query";
import { Chip } from "../../../src/components/Chip";
import { RecordPicker } from "../../../src/components/RecordPicker";
import { SignaturePad } from "../../../src/components/SignaturePad";
import { FreeChecklist } from "../../../src/components/FreeChecklist";
import { QueryState } from "../../../src/components/States";
import { WorkOrderForm, workOrderBody, type WorkOrderDraft } from "../../../src/components/WorkOrderForm";
import { STATUS_LABEL, toLocalInput, when } from "../../../src/format";
import { useAuth } from "../../../src/auth/store";
import { useCanUse, useManifest } from "../../../src/session";

interface ChecklistTemplate {
  id: string;
  name: string;
  items: Array<{ id: string; label: string }>;
}
interface WorkOrder {
  id: string;
  title: string;
  description?: string | null;
  status: WorkOrderDraft["status"];
  scheduledAt?: string | null;
  signedBy?: string | null;
  customFields?: Record<string, unknown> | null;
  customer?: { id: string; name: string } | null;
  asset?: { id: string; name: string; brand?: string | null; model?: string | null; serialNumber?: string | null } | null;
  assignee?: { id: string; name: string } | null;
  attachments: Array<{ id: string; fileName: string; url: string }>;
  checklistRuns: Array<{ id: string; answers: Array<{ label?: string; note?: string; checked?: boolean }> }>;
  stockMovements?: Array<{
    id: string;
    quantity: string | number;
    part?: { id: string; name: string } | null;
    location?: { name: string } | null;
  }>;
}

export default function WorkOrderScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const token = useAuth((state) => state.accessToken);
  const manifest = useManifest();
  const terms = manifest.data?.tenant.terminology;
  const [sheet, setSheet] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<WorkOrderDraft | null>(null);
  const [editError, setEditError] = useState("");
  const [signedBy, setSignedBy] = useState("");
  const [signature, setSignature] = useState("");
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [partQ, setPartQ] = useState("");
  const [partId, setPartId] = useState<string | null>(null);
  const [partQty, setPartQty] = useState("");
  const [partLocation, setPartLocation] = useState<string | null>(null);
  const [creatingPart, setCreatingPart] = useState(false);
  const [newPart, setNewPart] = useState({ name: "", sku: "", price: "" });
  const order = useQuery({ queryKey: ["work-order", id], queryFn: () => http.get<WorkOrder>(`/work-orders/${id}`) });
  const hasChecklists = useCanUse("checklists");
  const hasParts = useCanUse("spare_parts");
  const hasStock = useCanUse("stock");
  const templates = useQuery({ queryKey: ["checklists"], queryFn: () => http.get<ChecklistTemplate[]>("/checklist-templates"), enabled: hasChecklists });
  const parts = useQuery({
    queryKey: ["parts", partQ],
    queryFn: () => http.get<Array<{ id: string; name: string; sku: string }>>(`/spare-parts?q=${encodeURIComponent(partQ)}`),
    enabled: hasParts && hasStock,
  });
  const locations = useQuery({ queryKey: ["stock-locations"], queryFn: () => http.get<Array<{ id: string; name: string; kind: string }>>("/stock/locations"), enabled: hasParts && hasStock });

  const refresh = async () => queryClient.invalidateQueries({ queryKey: ["work-order", id] });
  const save = useMutation({
    mutationFn: (values: WorkOrderDraft) => http.patch(`/work-orders/${id}`, workOrderBody(values)),
    onSuccess: async () => {
      setEditing(false);
      await refresh();
    },
  });
  const sign = useMutation({
    mutationFn: () => http.post(`/work-orders/${id}/signature`, { signedBy, signatureData: signature }),
    onSuccess: async () => {
      setSheet(false);
      await refresh();
    },
  });
  const usePart = useMutation({
    mutationFn: () => {
      const quantity = Number(partQty.replace(",", "."));
      if (!partId) throw new Error("Scegli il ricambio");
      if (!partLocation) throw new Error("Scegli da dove lo prendi");
      if (!(quantity > 0)) throw new Error("Scrivi la quantità");
      return http.post(`/work-orders/${id}/parts`, { partId, locationId: partLocation, quantity });
    },
    onSuccess: async () => {
      setPartQty("");
      setPartId(null);
      setPartQ("");
      await refresh();
      await queryClient.invalidateQueries({ queryKey: ["balances"] });
    },
  });
  const createPart = useMutation({
    mutationFn: () =>
      http.post<{ id: string; name: string }>(
        "/spare-parts",
        sparePartSchema.parse({
          name: newPart.name,
          sku: newPart.sku,
          unitPrice: Number(newPart.price.replace(",", ".")) || 0,
          compatibleModels: [],
        }),
      ),
    onSuccess: async (created) => {
      setPartQ(created.name);
      setPartId(created.id);
      setCreatingPart(false);
      setNewPart({ name: "", sku: "", price: "" });
      await queryClient.invalidateQueries({ queryKey: ["parts"] });
    },
  });
  const runChecklist = useMutation({
    mutationFn: (template: ChecklistTemplate) =>
      http.post("/checklist-runs", {
        templateId: template.id,
        workOrderId: id,
        assetId: order.data?.asset?.id,
        completed: true,
        answers: template.items.map((item) => ({ id: item.id, label: item.label, checked: Boolean(checks[`${template.id}:${item.id}`]) })),
      }),
    onSuccess: refresh,
  });

  async function addPhoto() {
    const result = await ImagePicker.launchCameraAsync({ quality: 0.6 });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const form = new FormData();
    form.append("workOrderId", id);
    form.append("file", { uri: asset.uri, name: "foto.jpg", type: "image/jpeg" } as unknown as Blob);
    await fetch(`${API_URL}/attachments`, { method: "POST", headers: { authorization: `Bearer ${token}` }, body: form });
    await refresh();
  }

  async function pdf() {
    const destination = new File(Paths.cache, `rapportino-${id}.pdf`);
    const downloaded = await File.downloadFileAsync(`${API_URL}/work-orders/${id}/pdf`, destination, {
      headers: { authorization: `Bearer ${token}` },
      idempotent: true,
    });
    await Sharing.shareAsync(downloaded.uri);
  }

  return (
    <Screen onBack={() => router.back()}>
      <QueryState isLoading={order.isLoading} error={order.error} refetch={() => order.refetch()}>
        {order.data ? (
          <>
            <Text variant="display">{order.data.title}</Text>
            <Text muted>
              {STATUS_LABEL[order.data.status]} · {when(order.data.scheduledAt)}
            </Text>
            <Card style={{ gap: 6 }}>
              <Text variant="heading">{order.data.customer?.name ?? "Senza cliente"}</Text>
              <Text muted>
                {order.data.asset
                  ? [order.data.asset.name, order.data.asset.brand, order.data.asset.model, order.data.asset.serialNumber].filter(Boolean).join(" · ")
                  : `Nessun ${terms?.asset?.toLowerCase() ?? "impianto"}`}
              </Text>
              {order.data.assignee ? <Text muted>Tecnico: {order.data.assignee.name}</Text> : null}
              {order.data.description ? <Text>{order.data.description}</Text> : null}
            </Card>
            <Button
              label="Modifica"
              tone="secondary"
              onPress={() => {
                setEditError("");
                setDraft({
                  title: order.data!.title,
                  description: order.data!.description ?? "",
                  status: order.data!.status || "",
                  scheduledAt: toLocalInput(order.data!.scheduledAt),
                  customerId: order.data!.customer?.id ?? null,
                  assetId: order.data!.asset?.id ?? null,
                  assigneeId: order.data!.assignee?.id ?? null,
                  custom: Object.fromEntries(Object.entries(order.data!.customFields ?? {}).map(([key, field]) => [key, field == null ? "" : String(field)])),
                });
                setEditing(true);
              }}
            />
            <Button label="Foto" tone="secondary" onPress={() => void addPhoto()} />
            <Text muted>{order.data.attachments.length} allegati</Text>
            {order.data.checklistRuns.map((run) => (
              <Card key={run.id} style={{ gap: 4 }}>
                {run.answers.map((answer, index) => (
                  <Text key={index}>
                    {answer.note ? `${answer.label || "Note"}: ${answer.note}` : `${answer.checked ? "✓ " : ""}${answer.label || "Voce"}`}
                  </Text>
                ))}
              </Card>
            ))}
            {hasChecklists ? (
              <>
                {templates.data?.map((template) => (
                  <Card key={template.id} style={{ gap: 8 }}>
                    <Text variant="heading">{template.name}</Text>
                    {template.items.map((item) => (
                      <Button key={item.id} label={`${checks[`${template.id}:${item.id}`] ? "✓ " : ""}${item.label}`} tone={checks[`${template.id}:${item.id}`] ? "primary" : "secondary"} onPress={() => setChecks((current) => ({ ...current, [`${template.id}:${item.id}`]: !current[`${template.id}:${item.id}`] }))} />
                    ))}
                    <Button label="Salva modello" onPress={() => runChecklist.mutate(template)} />
                  </Card>
                ))}
                <FreeChecklist workOrderId={id} />
              </>
            ) : null}
            {hasParts && hasStock ? (
              <Card style={{ gap: 8 }}>
                <Text variant="heading">Ricambi usati</Text>
                {order.data.stockMovements?.filter((row) => row.part).length ? (
                  order.data.stockMovements
                    .filter((row) => row.part)
                    .map((row) => (
                      <Text key={row.id} muted>
                        {Math.abs(Number(row.quantity))}× {row.part?.name}
                        {row.location?.name ? ` · ${row.location.name}` : ""}
                      </Text>
                    ))
                ) : (
                  <Text muted>Nessun ricambio segnato su questo intervento.</Text>
                )}
                <RecordPicker
                  label="Ricambio"
                  query={partQ}
                  onQuery={setPartQ}
                  options={(parts.data ?? []).map((part) => ({ id: part.id, title: part.name, subtitle: part.sku }))}
                  value={partId}
                  onChange={setPartId}
                  onCreate={() => setCreatingPart(true)}
                  createLabel="Nuovo ricambio"
                />
                {parts.error ? <Text>{parts.error.message}</Text> : null}
                <Input label="Quantità" keyboardType="decimal-pad" value={partQty} onChangeText={setPartQty} />
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {(locations.data ?? []).map((location) => (
                    <Chip key={location.id} label={location.name} active={partLocation === location.id} onPress={() => setPartLocation(partLocation === location.id ? null : location.id)} />
                  ))}
                </View>
                {locations.error ? <Text>{locations.error.message}</Text> : null}
                {usePart.error ? <Text>{usePart.error.message}</Text> : null}
                <Button label="Aggiungi all'intervento" loading={usePart.isPending} onPress={() => usePart.mutate()} />
              </Card>
            ) : null}
            <Button label={order.data.signedBy ? `Firmato da ${order.data.signedBy}` : "Firma cliente"} onPress={() => setSheet(true)} />
            <Button label="PDF rapportino" tone="secondary" onPress={() => void pdf()} />
            <Sheet visible={editing} title="Modifica" onClose={() => setEditing(false)}>
              {draft ? <WorkOrderForm value={draft} onChange={setDraft} /> : null}
              {editError || save.error ? <Text>{editError || save.error?.message}</Text> : null}
              <Button
                label="Salva"
                loading={save.isPending}
                onPress={() => {
                  if (!draft) return;
                  try {
                    setEditError("");
                    save.mutate(draft);
                  } catch (caught) {
                    setEditError(caught instanceof Error ? caught.message : "Controlla i campi");
                  }
                }}
              />
            </Sheet>
            <Sheet visible={creatingPart} title="Nuovo ricambio" onClose={() => setCreatingPart(false)}>
              <Input label="Nome" value={newPart.name} onChangeText={(name) => setNewPart({ ...newPart, name })} />
              <Input label="Codice" value={newPart.sku} onChangeText={(sku) => setNewPart({ ...newPart, sku })} autoCapitalize="characters" />
              <Input label="Prezzo" keyboardType="decimal-pad" value={newPart.price} onChangeText={(price) => setNewPart({ ...newPart, price })} />
              {createPart.error ? <Text>{createPart.error.message}</Text> : null}
              <Button label="Crea e seleziona" loading={createPart.isPending} onPress={() => createPart.mutate()} />
            </Sheet>
            <Sheet visible={sheet} title="Firma" onClose={() => setSheet(false)}>
              <Input label="Nome di chi firma" value={signedBy} onChangeText={setSignedBy} />
              <SignaturePad onChange={setSignature} />
              <Button label="Conferma e chiudi" loading={sign.isPending} disabled={signedBy.length < 2 || signature.length < 2} onPress={() => sign.mutate()} />
            </Sheet>
          </>
        ) : null}
      </QueryState>
    </Screen>
  );
}
