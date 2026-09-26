import { supplierSchema } from "@rapportini/shared";
import type { z } from "zod";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Badge, Button, Card, EmptyState, Fab, Input, ListItem, Screen, Sheet, Text } from "@rapportini/ui";
import { http } from "../../../src/api/client";
import { queryClient } from "../../../src/api/query";
import { Chip } from "../../../src/components/Chip";
import { SupplierFields } from "../../../src/components/SupplierFields";
import { QueryState } from "../../../src/components/States";
import { STATUS_LABEL } from "../../../src/format";
import { t } from "../../../src/i18n";
import { can, useManifest } from "../../../src/session";
import { emptySupplier, supplierIssue, type SupplierDraft } from "../../../src/suppliers";

interface SupplierListItem {
  id: string;
  name: string;
  phone?: string | null;
  city?: string | null;
  openOrders?: number;
  _count?: { ingredients: number };
  orders: Array<{ id: string; status: string; lines: Array<{ description: string }> }>;
}

export default function SuppliersScreen() {
  const manifest = useManifest();
  const router = useRouter();
  const writable = can(manifest.data, "suppliers.write");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<SupplierDraft>(emptySupplier());
  const [formError, setFormError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [needle, setNeedle] = useState("");
  const [onlyOpen, setOnlyOpen] = useState(false);
  const query = useQuery({
    queryKey: ["suppliers", needle],
    queryFn: () => http.get<SupplierListItem[]>(`/suppliers${needle ? `?q=${encodeURIComponent(needle)}` : ""}`),
    placeholderData: keepPreviousData,
  });
  const save = useMutation({
    mutationFn: (values: z.infer<typeof supplierSchema>) => http.post("/suppliers", values),
    onSuccess: async () => {
      setOpen(false);
      setDraft(emptySupplier());
      await queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    },
  });

  useEffect(() => {
    const timer = setTimeout(() => setNeedle(q.trim()), 250);
    return () => clearTimeout(timer);
  }, [q]);

    const rows = (query.data ?? []).filter((supplier) => !onlyOpen || (supplier.openOrders ?? 0) > 0);

  function submit() {
    const parsed = supplierSchema.safeParse(draft);
    if (!parsed.success) {
      setFormError(supplierIssue(parsed.error));
      return;
    }
    setFormError(null);
    save.mutate(parsed.data);
  }

  return (
    <Screen onRefresh={() => query.refetch()}>
      <Text variant="display">Fornitori</Text>
      <Input label="Cerca" value={q} onChangeText={setQ} placeholder="Nome, città, telefono, P. IVA" />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Chip label="Tutti" active={!onlyOpen} onPress={() => setOnlyOpen(false)} />
        <Chip label="Con ordini aperti" active={onlyOpen} onPress={() => setOnlyOpen(true)} />
      </View>
      <QueryState isLoading={query.isLoading} error={query.error} refetch={() => query.refetch()}>
        {rows.length ? (
          rows.map((supplier) => {
            const latest = supplier.orders[0];
            const place = [supplier.city, supplier.phone].filter(Boolean).join(" · ");
            const goods = supplier._count?.ingredients ? `${supplier._count.ingredients} articol${supplier._count.ingredients === 1 ? "o" : "i"}` : "";
            const last = latest ? `${STATUS_LABEL[latest.status] ?? latest.status}${latest.lines[0] ? ` · ${latest.lines.slice(0, 2).map((line) => line.description).join(", ")}` : ""}` : "";
            return (
              <Card key={supplier.id}>
                <ListItem
                  title={supplier.name}
                  subtitle={[place, goods, last].filter(Boolean).join(" · ") || "Nessun ordine"}
                  trailing={
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      {(supplier.openOrders ?? 0) > 0 ? <Badge label={supplier.openOrders === 1 ? "1 aperto" : `${supplier.openOrders} aperti`} tone="warning" /> : null}
                      <Text muted style={{ fontSize: 20 }}>
                        ›
                      </Text>
                    </View>
                  }
                  onPress={() => router.push(`/(app)/suppliers/${supplier.id}`)}
                />
              </Card>
            );
          })
        ) : (
          <EmptyState title={t("emptyTitle")} message={needle || onlyOpen ? "Nessun fornitore corrisponde." : "Aggiungi il primo fornitore."} />
        )}
      </QueryState>
      {writable ? (
        <Fab
          onPress={() => {
            setDraft(emptySupplier());
            setFormError(null);
            save.reset();
            setOpen(true);
          }}
        />
      ) : null}
      <Sheet visible={open} title="Nuovo fornitore" onClose={() => setOpen(false)}>
        <SupplierFields draft={draft} onChange={setDraft} nameError={formError && formError.includes("nome") ? formError : undefined} />
        {formError && !formError.includes("nome") ? <Text>{formError}</Text> : null}
        {save.error ? <Text>{save.error.message}</Text> : null}
        <Button label={t("save")} loading={save.isPending} onPress={submit} />
      </Sheet>
    </Screen>
  );
}
