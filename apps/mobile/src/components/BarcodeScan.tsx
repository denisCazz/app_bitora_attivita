import { CameraView, useCameraPermissions, type BarcodeType } from "expo-camera";
import { useRef, type ReactNode } from "react";
import { Button, Screen, Text } from "@rapportini/ui";

const BARCODE_TYPES: BarcodeType[] = [
  "ean13",
  "ean8",
  "upc_a",
  "upc_e",
  "code128",
  "code39",
  "code93",
  "itf14",
  "codabar",
  "qr",
  "datamatrix",
  "pdf417",
  "aztec",
];

const barcodeScannerSettings = { barcodeTypes: BARCODE_TYPES };

export function BarcodeScan({
  title,
  onCode,
  onClose,
  footer,
}: {
  title: string;
  onCode: (code: string) => void | Promise<void>;
  onClose: () => void;
  footer?: ReactNode;
}) {
  const [permission, request] = useCameraPermissions();
  const locked = useRef(false);

  async function onScan(data: string) {
    if (locked.current) return;
    const code = data.replace(/[\u0000-\u001F]/g, "").trim();
    if (!code) return;
    locked.current = true;
    try {
      await onCode(code);
    } finally {
      setTimeout(() => {
        locked.current = false;
      }, 1200);
    }
  }

  if (!permission?.granted) {
    return (
      <Screen onBack={onClose}>
        <Text variant="title">Serve la fotocamera</Text>
        <Button label="Consenti" onPress={() => void request()} />
      </Screen>
    );
  }

  return (
    <Screen onBack={onClose} scroll={false}>
      <Text variant="display">{title}</Text>
      <CameraView
        style={{ flex: 1, borderRadius: 24, overflow: "hidden" }}
        barcodeScannerSettings={barcodeScannerSettings}
        onBarcodeScanned={({ data }) => void onScan(data)}
      />
      {footer}
      <Button label="Chiudi" tone="secondary" onPress={onClose} />
    </Screen>
  );
}
