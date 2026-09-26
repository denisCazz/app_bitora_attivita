import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { brandingSchema, terminologySchema } from "@rapportini/shared";
import { useMutation } from "@tanstack/react-query";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { View } from "react-native";
import { Button, Card, Input, Screen, Text, useTheme } from "@rapportini/ui";
import { http, mediaUrl, upload } from "../../../src/api/client";
import { queryClient } from "../../../src/api/query";
import { useManifest } from "../../../src/session";

const COLORS = ["#E25B2A", "#1C6B56", "#175CD3", "#7A4E2D", "#B42318"];
const EXTENSION: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

export default function BrandingScreen() {
  const router = useRouter();
  const manifest = useManifest();
  const theme = useTheme();
  const terms = manifest.data?.tenant.terminology;
  const logoUrl = manifest.data?.tenant.branding.logoUrl ?? null;
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
  const uploadLogo = useMutation({
    mutationFn: async () => {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.9 });
      if (result.canceled || !result.assets[0]) return;
      const picked = result.assets[0];
      const type = picked.mimeType && EXTENSION[picked.mimeType] ? picked.mimeType : "image/jpeg";
      await upload("/settings/logo", { uri: picked.uri, name: `logo-${Date.now()}.${EXTENSION[type]}`, type, blob: picked.file });
      await queryClient.invalidateQueries({ queryKey: ["manifest"] });
    },
  });
  const removeLogo = useMutation({
    mutationFn: () => http.del("/settings/logo"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["manifest"] }),
  });

  return (
    <Screen onBack={() => router.back()} backLabel="Impostazioni">
      <Text variant="display">Aspetto e parole</Text>
      <Text muted>Il colore segue il negozio. Le parole seguono il mestiere.</Text>

      <Card style={{ gap: 12 }}>
        <Text variant="heading">Logo dell'azienda</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <View
            style={{
              width: 76,
              height: 76,
              borderRadius: 18,
              borderCurve: "continuous",
              overflow: "hidden",
              backgroundColor: logoUrl ? "#fff" : theme.colors.field,
              borderWidth: 1,
              borderColor: theme.colors.line,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {logoUrl ? (
              <Image source={{ uri: mediaUrl(logoUrl) }} style={{ width: 68, height: 68 }} contentFit="contain" accessibilityLabel="Logo dell'azienda" />
            ) : (
              <Ionicons name="image-outline" size={28} color={theme.colors.inkSoft} />
            )}
          </View>
          <Text variant="caption" muted style={{ flex: 1 }}>
            Compare nella home e in testa ai rapportini PDF. PNG o JPG, al massimo 2 MB.
          </Text>
        </View>
        <Button tone="secondary" label={logoUrl ? "Cambia logo" : "Carica logo"} loading={uploadLogo.isPending} onPress={() => uploadLogo.mutate()} />
        {logoUrl ? <Button tone="ghost" label="Togli il logo" loading={removeLogo.isPending} onPress={() => removeLogo.mutate()} /> : null}
        {uploadLogo.error || removeLogo.error ? <Text style={{ color: theme.colors.danger }}>{(uploadLogo.error ?? removeLogo.error)?.message}</Text> : null}
      </Card>

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
