import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Button, Card, Screen, Text } from "@rapportini/ui";
import { http } from "../../../src/api/client";

export default function ScanScreen() {
  const router = useRouter();
  const [permission, request] = useCameraPermissions();
  const [found, setFound] = useState<string>("");
  const [locked, setLocked] = useState(false);

  async function onScan(data: string) {
    if (locked) return;
    setLocked(true);
    const parts = await http.get<Array<{ name: string; sku: string }>>(`/spare-parts?barcode=${encodeURIComponent(data)}`);
    setFound(parts[0] ? `${parts[0].name} · ${parts[0].sku}` : `Nessun ricambio per ${data}`);
  }

  if (!permission?.granted) {
    return (
      <Screen onBack={() => router.back()}>
        <Text variant="title">Serve la fotocamera</Text>
        <Button label="Consenti" onPress={() => void request()} />
      </Screen>
    );
  }

  return (
    <Screen onBack={() => router.back()} scroll={false}>
      <Text variant="display">Scansiona</Text>
      <CameraView style={{ flex: 1, borderRadius: 24, overflow: "hidden" }} barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "qr", "code128"] }} onBarcodeScanned={({ data }) => void onScan(data)} />
      {found ? <Card><Text>{found}</Text></Card> : null}
      <Button label="Chiudi" tone="secondary" onPress={() => router.back()} />
    </Screen>
  );
}
