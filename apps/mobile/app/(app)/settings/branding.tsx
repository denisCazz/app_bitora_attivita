import { useRouter } from "expo-router";
import { brandingSchema, terminologySchema } from "@rapportini/shared";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Button, Input, Screen, Text, useTheme } from "@rapportini/ui";
import { http } from "../../../src/api/client";
import { queryClient } from "../../../src/api/query";
import { useManifest } from "../../../src/session";

const COLORS = ["#E25B2A", "#1C6B56", "#175CD3", "#7A4E2D", "#B42318"];

export default function BrandingScreen() {
  const router = useRouter();
  const manifest = useManifest();
  const theme = useTheme();
  const terms = manifest.data?.tenant.terminology;
  const [accent, setAccent] = useState(manifest.data?.tenant.branding.accent ?? COLORS[0]!);
  const [workOrder, setWorkOrder] = useState(terms?.workOrder ?? "");
  const [workOrders, setWorkOrders] = useState(terms?.workOrders ?? "");
  const [asset, setAsset] = useState(terms?.asset ?? "");
  const [assets, setAssets] = useState(terms?.assets ?? "");
  const save = useMutation({
    mutationFn: async () => {
      await http.patch("/settings/branding", brandingSchema.parse({ accent }));
      await http.patch("/settings/terminology", terminologySchema.parse({ workOrder, workOrders, asset, assets }));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["manifest"] }),
  });

  return (
    <Screen onBack={() => router.back()} backLabel="Impostazioni">
      <Text variant="display">Aspetto e parole</Text>
      <Text muted>Il colore segue il negozio. Le parole seguono il mestiere.</Text>
      {COLORS.map((color) => (
        <Button key={color} label={color} tone={accent === color ? "primary" : "secondary"} style={{ backgroundColor: accent === color ? color : theme.colors.paperRaised }} onPress={() => setAccent(color)} />
      ))}
      <Input label="Singolare intervento" value={workOrder} onChangeText={setWorkOrder} />
      <Input label="Plurale interventi" value={workOrders} onChangeText={setWorkOrders} />
      <Input label="Singolare impianto" value={asset} onChangeText={setAsset} />
      <Input label="Plurale impianti" value={assets} onChangeText={setAssets} />
      {save.isSuccess ? <Text>Salvato. Riapri la home per vedere il menu aggiornato.</Text> : null}
      {save.error ? <Text>{save.error.message}</Text> : null}
      <Button label="Salva" loading={save.isPending} onPress={() => save.mutate()} />
    </Screen>
  );
}
