import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Badge, Card, ListItem, Screen, Text, useTheme } from "@rapportini/ui";
import { useAdminUsers } from "../../../../src/admin";
import { QueryState } from "../../../../src/components/States";

export default function AdminUsersScreen() {
  const theme = useTheme();
  const router = useRouter();
  const users = useAdminUsers();

  return (
    <Screen onBack={() => router.back()} backLabel="Console">
      <Text variant="display">Utenti</Text>
      <Text muted>Ogni account e i negozi collegati. Apri una persona per vedere categoria, moduli, parole, campi e ruoli.</Text>
      <QueryState isLoading={users.isLoading} error={users.error} refetch={() => void users.refetch()}>
        {users.data?.length ? (
          <Card style={{ paddingVertical: 4 }}>
            {users.data.map((user) => (
              <ListItem
                key={user.id}
                title={user.name}
                subtitle={
                  user.shops.length
                    ? `${user.email} · ${user.shops.map((shop) => `${shop.name} (${shop.categoryLabel})`).join(", ")}`
                    : `${user.email} · nessun negozio`
                }
                leading={<Ionicons name="person-outline" size={20} color={theme.colors.accent} />}
                trailing={user.platformAdmin ? <Badge tone="accent" label="Admin" /> : undefined}
                onPress={() => router.push(`/(app)/admin/users/${user.id}`)}
              />
            ))}
          </Card>
        ) : (
          <Text muted>Nessun account.</Text>
        )}
      </QueryState>
    </Screen>
  );
}
