import { useRouter } from "expo-router";
import { useState } from "react";
import { Card, Text } from "@rapportini/ui";
import { http } from "../../../src/api/client";
import { BarcodeScan } from "../../../src/components/BarcodeScan";

export default function ScanScreen() {
  const router = useRouter();
  const [found, setFound] = useState("");

  return (
    <BarcodeScan
      title="Scansiona"
      onClose={() => router.back()}
      onCode={async (data) => {
        try {
          const parts = await http.get<Array<{ name: string; sku: string }>>(`/spare-parts?barcode=${encodeURIComponent(data)}`);
          setFound(parts[0] ? `${parts[0].name} · ${parts[0].sku}` : `Nessun ricambio per ${data}`);
        } catch (error) {
          setFound(error instanceof Error ? error.message : "Lettura non riuscita");
        }
      }}
      footer={found ? <Card><Text>{found}</Text></Card> : null}
    />
  );
}
