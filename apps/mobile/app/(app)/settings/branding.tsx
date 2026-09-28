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
import { ColorPicker } from "../../../src/components/ColorPicker";
import { useManifest } from "../../../src/session";

const DEFAULT_ACCENT = "#E25B2A";
const LOGO_MAX_BYTES = 6 * 1024 * 1024;
const EXTENSION: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

export default function BrandingScreen() {
  const router = useRouter();
  const manifest = useManifest();
  const theme = useTheme();
  const terms = manifest.data?.tenant.terminology;
  const logoUrl = manifest.data?.tenant.branding.logoUrl ?? null;
  const [accent, setAccent] = useState(manifest.data?.tenant.branding.accent ?? DEFAULT_ACCENT);
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
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.7,
        // HEIC photos come back as JPEG and iCloud-only photos get downloaded instead of failing.
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
        shouldDownloadFromNetwork: true,
      });
      if (result.canceled || !result.assets[0]) return;
      const picked = result.assets[0];
      if (picked.fileSize && picked.fileSize > LOGO_MAX_BYTES) throw new Error("Immagine troppo grande: scegline una sotto i 6 MB.");
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
            Compare nella home e in testa ai rapportini PDF. PNG o JPG, al massimo 6 MB.
          </Text>
        </View>
        <Button tone="secondary" label={logoUrl ? "Cambia logo" : "Carica logo"} loading={uploadLogo.isPending} onPress={() => uploadLogo.mutate()} />
        {logoUrl ? <Button tone="ghost" label="Togli il logo" loading={removeLogo.isPending} onPress={() => removeLogo.mutate()} /> : null}
        {uploadLogo.error || removeLogo.error ? <Text style={{ color: theme.colors.danger }}>{(uploadLogo.error ?? removeLogo.error)?.message}</Text> : null}
      </Card>

      <Card style={{ gap: 12 }}>
        <Text variant="heading">Colore dell'app</Text>
        <Text variant="caption" muted>
          Scegli una tinta o regola tonalità e luminosità. Tocca Salva per applicarlo a tutti.
        </Text>
        <ColorPicker value={accent} onChange={setAccent} />
      </Card>
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
