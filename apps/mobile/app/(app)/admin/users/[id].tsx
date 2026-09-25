import { PERMISSION_COPY, TERMINOLOGY_KEYS, type Permission, type Terminology } from "@rapportini/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { View } from "react-native";
import { Badge, Card, Screen, Text, useTheme } from "@rapportini/ui";
import { useAdminUser, type AdminUserShop } from "../../../../src/admin";
import { QueryState } from "../../../../src/components/States";

const TERM_LABEL: Record<keyof Terminology, string> = {
  workOrder: "Intervento",
  workOrders: "Interventi",
  asset: "Impianto",
  assets: "Impianti",
  customer: "Cliente",
  customers: "Clienti",
  sparePart: "Ricambio",
  spareParts: "Ricambi",
  warehouse: "Magazzino",
  vehicle: "Mezzo",
};

const ENTITY_LABEL: Record<string, string> = {
  CUSTOMER: "Cliente",
  ASSET: "Impianto",
  WORK_ORDER: "Intervento",
  PRODUCT: "Prodotto",
};

const FIELD_TYPE: Record<string, string> = {
  TEXT: "testo",
  NUMBER: "numero",
  DATE: "data",
  SELECT: "scelta",
  PHOTO: "foto",
};

function moduleState(module: AdminUserShop["modules"][number]) {
  if (!module.enabled) return "spento";
  if (module.licensed) return "a pagamento";
  if (module.trialEndsAt && new Date(module.trialEndsAt) > new Date()) return "in prova";
  if (module.free) return "incluso";
  return "acceso";
}

function ShopCard({ shop }: { shop: AdminUserShop }) {
  const theme = useTheme();
  const words = TERMINOLOGY_KEYS.flatMap((key) => {
    const value = shop.terminology[key];
    return value ? [`${TERM_LABEL[key]}: ${value}`] : [];
  });

  return (
    <Card style={{ gap: 14 }}>
      <View style={{ gap: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <Text variant="title">{shop.name}</Text>
          <Badge tone="accent" label={shop.roleName} />
        </View>
        <Text muted>{shop.category.path.join(" · ") || shop.category.label}</Text>
      </View>

      <View style={{ gap: 6 }}>
        <Text variant="heading">Esigenze</Text>
        {shop.needs.length ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {shop.needs.map((need) => (
              <Badge key={need.key} label={need.label} />
            ))}
          </View>
        ) : (
          <Text muted>Nessuna scelta.</Text>
        )}
      </View>

      <View style={{ gap: 6 }}>
        <Text variant="heading">Aspetto</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: shop.branding.accent ?? theme.colors.accent }} />
          <Text>{shop.branding.accent ?? "Colore della categoria"}</Text>
        </View>
        <Text muted>{shop.branding.logoUrl ? "Logo caricato" : "Senza logo"}</Text>
      </View>

      <View style={{ gap: 6 }}>
        <Text variant="heading">Parole</Text>
        <Text muted>{words.length ? words.join("\n") : "Usa i termini della categoria, senza modifiche."}</Text>
      </View>

      <View style={{ gap: 6 }}>
        <Text variant="heading">Moduli</Text>
        {shop.modules.length ? (
          shop.modules.map((module) => (
            <View key={module.key} style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
              <Text>{module.label}</Text>
              <Text muted>{moduleState(module)}</Text>
            </View>
          ))
        ) : (
          <Text muted>Nessun modulo attivato.</Text>
        )}
      </View>

      <View style={{ gap: 6 }}>
        <Text variant="heading">Campi personalizzati</Text>
        {shop.fields.length ? (
          shop.fields.map((field) => (
            <Text key={field.id} muted>
              {ENTITY_LABEL[field.entity] ?? field.entity} · {field.label} ({FIELD_TYPE[field.type] ?? field.type}
              {field.required ? ", obbligatorio" : ""}
              {field.options.length ? `: ${field.options.join(", ")}` : ""})
            </Text>
          ))
        ) : (
          <Text muted>Nessun campo in più.</Text>
        )}
      </View>

      <View style={{ gap: 8 }}>
        <Text variant="heading">Ruoli</Text>
        {shop.roles.map((role) => (
          <View key={role.name} style={{ gap: 2 }}>
            <Text>
              {role.name}
              {role.isSystem ? " · titolare" : ""}
            </Text>
            <Text variant="caption" muted>
              {role.permissions.map((permission) => PERMISSION_COPY[permission as Permission]?.label ?? permission).join(" · ")}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

export default function AdminUserScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const user = useAdminUser(id);

  return (
    <Screen onBack={() => router.back()} backLabel="Utenti">
      <QueryState isLoading={user.isLoading} error={user.error} refetch={() => void user.refetch()}>
        {user.data ? (
          <View style={{ gap: 6 }}>
            <Text variant="display">{user.data.name}</Text>
            <Text muted>{user.data.email}</Text>
            {user.data.platformAdmin ? <Badge tone="accent" label="Admin di piattaforma" /> : null}
          </View>
        ) : null}
        {user.data && !user.data.shops.length ? <Text muted>Questo account non ha ancora un negozio.</Text> : null}
        {user.data?.shops.map((shop) => (
          <ShopCard key={shop.id} shop={shop} />
        ))}
      </QueryState>
    </Screen>
  );
}
