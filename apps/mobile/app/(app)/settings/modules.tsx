import type { ModuleKey, ModuleStatus } from "@rapportini/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Switch, View } from "react-native";
import { Badge, Button, Card, Screen, Text, useTheme } from "@rapportini/ui";
import { http } from "../../../src/api/client";
import { queryClient } from "../../../src/api/query";
import { monthly } from "../../../src/billing";

interface ModuleRow {
  moduleKey: ModuleKey;
  enabled: boolean;
  label: string;
  description: string;
  status: ModuleStatus;
  priceCents: number;
  free: boolean;
}

export default function ModulesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const query = useQuery({ queryKey: ["modules"], queryFn: () => http.get<ModuleRow[]>("/modules") });
  const toggle = useMutation({
    mutationFn: (row: ModuleRow) => http.patch("/modules", { moduleKey: row.moduleKey, enabled: !row.enabled }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["modules"] });
      await queryClient.invalidateQueries({ queryKey: ["manifest"] });
    },
  });
  return (
    <Screen onBack={() => router.back()} backLabel="Impostazioni">
      <Text variant="display">Moduli</Text>
      <Text muted>Quello che spegni sparisce dal menu, per tutti. I moduli bloccati si sbloccano dallo Store.</Text>
      {query.data?.map((row) => (
        <Card key={row.moduleKey} style={{ gap: 10, opacity: row.status === "locked" ? 0.85 : 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text variant="heading">{row.label}</Text>
              <Text variant="caption" muted>
                {row.description}
              </Text>
            </View>
            {row.status === "locked" ? null : (
              <Switch
                value={row.enabled}
                onValueChange={() => toggle.mutate(row)}
                trackColor={{ true: theme.colors.accent, false: theme.colors.line }}
                thumbColor="#fff"
              />
            )}
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {row.free ? <Badge tone="success" label="Incluso" /> : null}
            {row.status === "trial" ? <Badge tone="accent" label="In prova" /> : null}
            {!row.free && row.status !== "locked" && row.status !== "trial" ? <Badge tone="accent" label={monthly(row.priceCents)} /> : null}
          </View>
          {row.status === "locked" ? (
            <Button tone="secondary" label={`Sblocca · ${monthly(row.priceCents)}`} onPress={() => router.push({ pathname: "/(app)/store", params: { module: row.moduleKey } })} />
          ) : null}
        </Card>
      ))}
    </Screen>
  );
}
