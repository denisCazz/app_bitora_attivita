import { Ionicons } from "@expo/vector-icons";
import { sparePartSchema } from "@rapportini/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Linking, View } from "react-native";
import { Button, Input, Screen, Sheet, Text, shiftHue, useTheme } from "@rapportini/ui";
import { API_URL, http, upload } from "../../../src/api/client";
import { queryClient } from "../../../src/api/query";
import { confirmDestructive } from "../../../src/confirm";
import { Chip } from "../../../src/components/Chip";
import { RecordPicker } from "../../../src/components/RecordPicker";
import { SignaturePad } from "../../../src/components/SignaturePad";
import { FreeChecklist } from "../../../src/components/FreeChecklist";
import { QueryState } from "../../../src/components/States";
import { CircleButton, Hero, HeroButton, HeroPill } from "../../../src/components/Hero";
import { ActionCircle, CheckRow, FieldGrid, InfoRow, LinkPill, PhotoGallery, PhotoViewer, Rows, Section, SignatureRow, isImage, type Attachment } from "../../../src/components/WorkOrderDetail";
import { WorkOrderForm, workOrderBody, type WorkOrderDraft } from "../../../src/components/WorkOrderForm";
import { STATUS_LABEL, toLocalInput } from "../../../src/format";
import { addressLine, formatDuration, openDirections } from "../../../src/maps";
import { useAuth } from "../../../src/auth/store";
import { can, useCanUse, useManifest } from "../../../src/session";

interface ChecklistTemplate {
  id: string;
  name: string;
  items: Array<{ id: string; label: string }>;
}
interface Place {
  name: string;
  address?: string | null;
  city?: string | null;
}
interface WorkOrder {
  id: string;
  title: string;
  description?: string | null;
  status: WorkOrderDraft["status"];
  scheduledAt?: string | null;
  durationMinutes?: number | null;
  completedAt?: string | null;
  signedBy?: string | null;
  technicianSignedBy?: string | null;
  customFields?: Record<string, unknown> | null;
  customer?: (Place & { id: string; phone?: string | null; email?: string | null }) | null;
  asset?: { id: string; name: string; brand?: string | null; model?: string | null; serialNumber?: string | null; location?: Place | null } | null;
  assignee?: { id: string; name: string } | null;
  attachments: Attachment[];
  checklistRuns: Array<{ id: string; answers: Array<{ label?: string; note?: string; checked?: boolean }> }>;
  stockMovements?: Array<{
    id: string;
    quantity: string | number;
    part?: { id: string; name: string } | null;
    location?: { name: string } | null;
  }>;
}

const EXTENSION: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/heic": "heic", "image/webp": "webp" };

function scheduleLine(order: WorkOrder) {
  if (!order.scheduledAt) return "Senza data";
  const date = new Date(order.scheduledAt);
  const day = date.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
  const time = date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  return [`${day.charAt(0).toUpperCase()}${day.slice(1)}`, time, order.durationMinutes ? formatDuration(order.durationMinutes) : null].filter(Boolean).join(" · ");
}

export default function WorkOrderScreen() {
  const router = useRouter();
  const theme = useTheme();
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
  const [signer, setSigner] = useState<"CLIENT" | "TECHNICIAN">("CLIENT");
  const [padKey, setPadKey] = useState(0);
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [partQ, setPartQ] = useState("");
  const [partId, setPartId] = useState<string | null>(null);
  const [partQty, setPartQty] = useState("");
  const [partLocation, setPartLocation] = useState<string | null>(null);
  const [addingPart, setAddingPart] = useState(false);
  const [creatingPart, setCreatingPart] = useState(false);
  const [newPart, setNewPart] = useState({ name: "", sku: "", price: "" });
  const [uploading, setUploading] = useState(0);
  const [photoError, setPhotoError] = useState("");
  const [viewing, setViewing] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const order = useQuery({ queryKey: ["work-order", id], queryFn: () => http.get<WorkOrder>(`/work-orders/${id}`) });
  const hasAccounting = useCanUse("accounting") && can(manifest.data, "accounting.read");
  const hasChecklists = useCanUse("checklists");
  const hasParts = useCanUse("spare_parts");
  const hasStock = useCanUse("stock");
  const templates = useQuery({ queryKey: ["checklists"], queryFn: () => http.get<ChecklistTemplate[]>("/checklist-templates"), enabled: hasChecklists });
  const parts = useQuery({
    queryKey: ["parts", partQ],
    queryFn: () => http.get<Array<{ id: string; name: string; sku: string }>>(`/spare-parts?q=${encodeURIComponent(partQ)}`),
    enabled: hasParts && hasStock && addingPart,
  });
  const locations = useQuery({
    queryKey: ["stock-locations"],
    queryFn: () => http.get<Array<{ id: string; name: string; kind: string }>>("/stock/locations"),
    enabled: hasParts && hasStock && addingPart,
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["work-order", id] });
    await queryClient.invalidateQueries({ queryKey: ["work-orders"] });
  };
  const save = useMutation({
    mutationFn: (values: WorkOrderDraft) => http.patch(`/work-orders/${id}`, workOrderBody(values)),
    onSuccess: async () => {
      setEditing(false);
      await refresh();
    },
  });
  const start = useMutation({
    mutationFn: () => http.patch(`/work-orders/${id}`, { status: "IN_PROGRESS" }),
    onSuccess: refresh,
  });
  const sign = useMutation({
    mutationFn: () => http.post(`/work-orders/${id}/signature`, { signedBy, signatureData: signature, role: signer }),
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
      setAddingPart(false);
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
    onSuccess: async (_, template) => {
      setChecks((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`${template.id}:`))));
      await refresh();
    },
  });
  const removePhoto = useMutation({
    mutationFn: (photo: Attachment) => http.del(`/attachments/${photo.id}`),
    onSuccess: refresh,
  });

  async function uploadAssets(assets: ImagePicker.ImagePickerAsset[]) {
    setPhotoError("");
    setUploading((count) => count + assets.length);
    for (const [index, asset] of assets.entries()) {
      const type = asset.mimeType ?? "image/jpeg";
      try {
        await upload(
          "/attachments",
          { uri: asset.uri, name: `foto-${Date.now()}-${index}.${EXTENSION[type] ?? "jpg"}`, type, blob: asset.file },
          { workOrderId: String(id) },
        );
        await refresh();
      } catch (caught) {
        setPhotoError(caught instanceof Error ? `Foto non caricata: ${caught.message}` : "Foto non caricata, riprova.");
      } finally {
        setUploading((count) => count - 1);
      }
    }
  }

  async function takePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Fotocamera non consentita", "Attiva l'accesso alla fotocamera nelle impostazioni per fotografare l'intervento.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.6 });
    if (!result.canceled) await uploadAssets(result.assets);
  }

  async function pickPhotos() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: 10, quality: 0.6 });
    if (!result.canceled) await uploadAssets(result.assets);
  }

  async function confirmDelete(file: Attachment) {
    const photo = isImage(file);
    const ok = await confirmDestructive(photo ? "Eliminare la foto?" : "Eliminare l'allegato?", "Verrà tolta dall'intervento e dal rapportino.");
    if (!ok) return;
    if (photo) {
      const left = (order.data?.attachments.filter(isImage).length ?? 1) - 1;
      if (left <= 0) setViewing(null);
      else setViewing((current) => (current === null ? null : Math.min(current, left - 1)));
    }
    removePhoto.mutate(file);
  }

  function openSign(role: "CLIENT" | "TECHNICIAN") {
    setSigner(role);
    setSignature("");
    setPadKey((current) => current + 1);
    setSignedBy(role === "TECHNICIAN" ? (order.data?.technicianSignedBy || order.data?.assignee?.name || "") : (order.data?.signedBy ?? ""));
    setSheet(true);
  }

  function openEdit(data: WorkOrder) {
    setEditError("");
    setDraft({
      title: data.title,
      description: data.description ?? "",
      status: data.status || "",
      scheduledAt: toLocalInput(data.scheduledAt),
      customerId: data.customer?.id ?? null,
      assetId: data.asset?.id ?? null,
      assigneeId: data.assignee?.id ?? null,
      custom: Object.fromEntries(Object.entries(data.customFields ?? {}).map(([key, field]) => [key, field == null ? "" : String(field)])),
    });
    setEditing(true);
  }

  async function pdf() {
    setExporting(true);
    try {
      const destination = new File(Paths.cache, `rapportino-${id}.pdf`);
      const downloaded = await File.downloadFileAsync(`${API_URL}/work-orders/${id}/pdf`, destination, {
        headers: { authorization: `Bearer ${token}` },
        idempotent: true,
      });
      await Sharing.shareAsync(downloaded.uri);
    } catch (caught) {
      Alert.alert("PDF non disponibile", caught instanceof Error ? caught.message : "Riprova tra poco.");
    } finally {
      setExporting(false);
    }
  }

  const data = order.data;
  const address = data ? (addressLine(data.asset?.location) ?? addressLine(data.customer)) : null;
  const phone = data?.customer?.phone?.trim();
  const photos = data?.attachments.filter(isImage) ?? [];
  const usedParts = data?.stockMovements?.filter((row) => row.part) ?? [];
  const assetLabel = terms?.asset ?? "Impianto";
  const heroColors: readonly [string, string] | undefined =
    data?.status === "DONE" ? [theme.colors.success, shiftHue(theme.colors.success, 28, 0.06)] : data?.status === "CANCELLED" ? ["#5C606C", "#8A8F9C"] : undefined;

  return (
    <Screen onBack={() => router.back()}>
      <QueryState isLoading={order.isLoading} error={order.error} refetch={() => order.refetch()}>
        {data ? (
          <>
            <Hero colors={heroColors}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <HeroPill label={STATUS_LABEL[data.status] ?? data.status} />
                <Text variant="caption" numberOfLines={1} style={{ color: "rgba(255,255,255,0.85)", flex: 1 }}>
                  {scheduleLine(data)}
                </Text>
              </View>
              <Text variant="display" numberOfLines={3} style={{ color: "#fff", fontSize: 30, lineHeight: 35 }}>
                {data.title}
              </Text>
              {data.customer?.name || address ? (
                <Text numberOfLines={2} style={{ color: "rgba(255,255,255,0.88)", marginTop: 2 }}>
                  {[data.customer?.name, address].filter(Boolean).join(" · ")}
                </Text>
              ) : null}
              <View style={{ flexDirection: "row", marginTop: 16 }}>
                {data.status === "DRAFT" || data.status === "SCHEDULED" ? (
                  <HeroButton icon="play" label="Inizia intervento" loading={start.isPending} onPress={() => start.mutate()} />
                ) : data.status === "IN_PROGRESS" ? (
                  <HeroButton icon="create" label="Firma del cliente e chiudi" onPress={() => openSign("CLIENT")} />
                ) : (
                  <HeroPill
                    icon={data.status === "DONE" ? "checkmark-circle" : "close-circle"}
                    label={
                      data.status === "DONE"
                        ? `Chiuso${data.completedAt ? ` il ${new Date(data.completedAt).toLocaleDateString("it-IT", { day: "numeric", month: "long" })}` : ""}${data.signedBy ? ` · ${data.signedBy}` : ""}`
                        : "Intervento annullato"
                    }
                  />
                )}
              </View>
            </Hero>
            {start.error ? <Text style={{ color: theme.colors.danger }}>{start.error.message}</Text> : null}

            <View style={{ flexDirection: "row" }}>
              {address ? <ActionCircle icon="navigate" label="Naviga" onPress={() => openDirections([address], `Indicazioni per ${data.customer?.name ?? data.title}`)} /> : null}
              {phone ? <ActionCircle icon="call" label="Chiama" onPress={() => void Linking.openURL(`tel:${phone.replace(/\s/g, "")}`)} /> : null}
              <ActionCircle icon="camera" label="Foto" onPress={() => void takePhoto()} />
              <ActionCircle icon="create-outline" label="Modifica" onPress={() => openEdit(data)} />
              <ActionCircle icon="share-outline" label="PDF" loading={exporting} onPress={() => void pdf()} />
            </View>
            {hasAccounting ? (
              <Button
                label="Pagamento"
                tone="secondary"
                onPress={() => router.push({ pathname: "/(app)/payments", params: { workOrderId: data.id } })}
              />
            ) : null}

            <Section title="Cliente e luogo" flush>
              <Rows>
                <InfoRow icon="person-outline">
                  <Text style={{ fontWeight: "600" }}>{data.customer?.name ?? "Senza cliente"}</Text>
                  {data.customer?.email ? (
                    <Text variant="caption" muted>
                      {data.customer.email}
                    </Text>
                  ) : null}
                </InfoRow>
                <InfoRow
                  icon="location-outline"
                  action={address ? <CircleButton icon="navigate" label="Naviga" onPress={() => openDirections([address], `Indicazioni per ${data.customer?.name ?? data.title}`)} /> : undefined}
                >
                  <Text muted={!address}>{address ?? "Nessun indirizzo"}</Text>
                  {data.asset?.location?.name ? (
                    <Text variant="caption" muted>
                      {data.asset.location.name}
                    </Text>
                  ) : null}
                </InfoRow>
                {phone ? (
                  <InfoRow icon="call-outline" action={<CircleButton icon="call" label="Chiama" onPress={() => void Linking.openURL(`tel:${phone.replace(/\s/g, "")}`)} />}>
                    <Text>{phone}</Text>
                  </InfoRow>
                ) : null}
                <InfoRow icon="hardware-chip-outline">
                  <Text muted={!data.asset}>{data.asset ? [data.asset.name, data.asset.brand, data.asset.model].filter(Boolean).join(" · ") : `Nessun ${assetLabel.toLowerCase()}`}</Text>
                  {data.asset?.serialNumber ? (
                    <Text variant="caption" muted>
                      Matricola {data.asset.serialNumber}
                    </Text>
                  ) : null}
                </InfoRow>
                <InfoRow icon="person-circle-outline">
                  <Text muted={!data.assignee}>{data.assignee ? data.assignee.name : "Nessun tecnico assegnato"}</Text>
                  {data.assignee ? (
                    <Text variant="caption" muted>
                      Tecnico
                    </Text>
                  ) : null}
                </InfoRow>
              </Rows>
            </Section>

            {data.description ? (
              <Section title="Descrizione">
                <Text style={{ lineHeight: 23 }}>{data.description}</Text>
              </Section>
            ) : null}

            <WorkOrderFields values={data.customFields} />

            <Section
              title="Foto"
              accessory={
                photos.length ? (
                  <Text variant="caption" muted>
                    {photos.length}
                  </Text>
                ) : null
              }
            >
              <PhotoGallery
                files={data.attachments}
                uploading={uploading}
                onCamera={() => void takePhoto()}
                onLibrary={() => void pickPhotos()}
                onOpen={setViewing}
                onDelete={(file) => void confirmDelete(file)}
                deletingId={removePhoto.isPending ? removePhoto.variables?.id : undefined}
              />
              {photoError ? (
                <Text variant="caption" style={{ color: theme.colors.danger }}>
                  {photoError}
                </Text>
              ) : null}
              {removePhoto.error ? (
                <Text variant="caption" style={{ color: theme.colors.danger }}>
                  {removePhoto.error.message}
                </Text>
              ) : null}
            </Section>

            {hasChecklists ? (
              <Section title="Checklist">
                {data.checklistRuns.map((run) => (
                  <View key={run.id} style={{ gap: 2, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: theme.colors.line }}>
                    {run.answers.map((answer, index) => (
                      <CheckRow key={index} label={answer.label?.trim() || "Voce"} checked={Boolean(answer.checked)} note={answer.note?.trim()} />
                    ))}
                  </View>
                ))}
                {templates.data?.map((template) => (
                  <View key={template.id} style={{ gap: 4 }}>
                    <Text variant="label" muted>
                      {template.name}
                    </Text>
                    {template.items.map((item) => {
                      const key = `${template.id}:${item.id}`;
                      return <CheckRow key={item.id} label={item.label} checked={Boolean(checks[key])} onPress={() => setChecks((current) => ({ ...current, [key]: !current[key] }))} />;
                    })}
                    <Button label={`Salva «${template.name}»`} tone="soft" loading={runChecklist.isPending && runChecklist.variables?.id === template.id} onPress={() => runChecklist.mutate(template)} />
                  </View>
                ))}
                <FreeChecklist workOrderId={id} embedded />
              </Section>
            ) : null}

            {hasParts && hasStock ? (
              <Section
                title="Ricambi usati"
                accessory={!addingPart ? <LinkPill icon="add" label="Aggiungi" onPress={() => setAddingPart(true)} /> : null}
              >
                {usedParts.length ? (
                  usedParts.map((row) => (
                    <View key={row.id} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <View style={{ minWidth: 36, paddingHorizontal: 6, paddingVertical: 3, borderRadius: theme.radius.sm, alignItems: "center", backgroundColor: theme.colors.accentSoft }}>
                        <Text variant="label" style={{ color: theme.colors.accent }}>
                          {Math.abs(Number(row.quantity))}×
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text>{row.part?.name}</Text>
                        {row.location?.name ? (
                          <Text variant="caption" muted>
                            da {row.location.name}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  ))
                ) : !addingPart ? (
                  <Text variant="caption" muted>
                    Nessun ricambio segnato su questo intervento.
                  </Text>
                ) : null}
                {addingPart ? (
                  <View style={{ gap: 10 }}>
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
                    <Text variant="caption" muted>
                      Da dove lo prendi
                    </Text>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                      {(locations.data ?? []).map((location) => (
                        <Chip key={location.id} label={location.name} active={partLocation === location.id} onPress={() => setPartLocation(partLocation === location.id ? null : location.id)} />
                      ))}
                    </View>
                    {locations.error ? <Text>{locations.error.message}</Text> : null}
                    {usePart.error ? <Text style={{ color: theme.colors.danger }}>{usePart.error.message}</Text> : null}
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <Button label="Annulla" tone="ghost" style={{ flex: 1 }} onPress={() => setAddingPart(false)} />
                      <Button label="Aggiungi" loading={usePart.isPending} style={{ flex: 2 }} onPress={() => usePart.mutate()} />
                    </View>
                  </View>
                ) : null}
              </Section>
            ) : null}

            <Section title="Firme">
              <View style={{ flexDirection: "row", gap: 10 }}>
                <SignatureRow role="Tecnico" signedBy={data.technicianSignedBy} onPress={() => openSign("TECHNICIAN")} />
                <SignatureRow role="Cliente" signedBy={data.signedBy} onPress={() => openSign("CLIENT")} />
              </View>
              {!data.signedBy ? (
                <Text variant="caption" muted>
                  La firma del cliente chiude l'intervento.
                </Text>
              ) : null}
            </Section>

            <PhotoViewer photos={photos} index={viewing} onClose={() => setViewing(null)} onDelete={(file) => void confirmDelete(file)} />
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
            <Sheet visible={sheet} title={signer === "TECHNICIAN" ? "Firma del tecnico" : "Firma del cliente"} onClose={() => setSheet(false)}>
              <Input label="Nome di chi firma" value={signedBy} onChangeText={setSignedBy} />
              <SignaturePad key={padKey} onChange={setSignature} />
              {sign.error ? <Text style={{ color: theme.colors.danger }}>{sign.error.message}</Text> : null}
              <Button
                label={signer === "TECHNICIAN" ? "Salva firma" : "Conferma e chiudi"}
                loading={sign.isPending}
                disabled={signedBy.length < 2 || signature.length < 2}
                onPress={() => sign.mutate()}
              />
            </Sheet>
          </>
        ) : null}
      </QueryState>
    </Screen>
  );
}

const NOT_INCLUDED = new Set(["no", "n", "false", "non incluso", "non inclusa", "escluso", "esclusa", "non eseguito", "non eseguita"]);

function fieldDisplay(value: unknown): { text: string; missing: boolean } {
  if (typeof value === "boolean") return value ? { text: "Incluso", missing: false } : { text: "Non incluso", missing: true };
  if (value == null || String(value).trim() === "") return { text: "Non incluso", missing: true };
  const text = String(value).trim();
  if (NOT_INCLUDED.has(text.toLowerCase())) return { text: "Non incluso", missing: true };
  return { text, missing: false };
}

function WorkOrderFields({ values }: { values?: Record<string, unknown> | null }) {
  const manifest = useManifest();
  const fields = (manifest.data?.customFields ?? []).filter((field) => field.entity === "WORK_ORDER" && field.type !== "PHOTO");
  if (!fields.length) return null;
  return (
    <Section title="Dettagli">
      <FieldGrid
        rows={fields.map((field) => {
          const shown = fieldDisplay(values?.[field.key]);
          return { key: field.key, label: field.label, value: shown.text, missing: shown.missing };
        })}
      />
    </Section>
  );
}
