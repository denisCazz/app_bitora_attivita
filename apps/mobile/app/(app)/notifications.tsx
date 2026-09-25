import { Ionicons } from "@expo/vector-icons";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Button, Card, EmptyState, ListItem, Screen, Text, useTheme } from "@rapportini/ui";
import { http } from "../../src/api/client";
import { queryClient } from "../../src/api/query";
import { QueryState } from "../../src/components/States";
import { when } from "../../src/format";
import { useNotices, type Notice } from "../../src/notices";

function openHref(router: ReturnType<typeof useRouter>, href: string | null) {
  if (!href || !href.startsWith("/") || href.startsWith("//")) return;
  router.push(`/(app)${href}` as never);
}

export default function NotificationsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const notices = useNotices(true);
  const unread = (notices.data ?? []).filter((notice) => !notice.readAt).length;
  const readAll = useMutation({
    mutationFn: () => http.post("/notifications/read"),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
  const readOne = useMutation({
    mutationFn: (notice: Notice) => http.post(`/notifications/${notice.id}/read`),
    onSuccess: async (_data, notice) => {
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
      openHref(router, notice.href);
    },
  });

  return (
    <Screen onBack={() => router.back()} backLabel="Home">
      <Text variant="display">Notifiche</Text>
      <QueryState isLoading={notices.isLoading} error={notices.error} refetch={() => notices.refetch()}>
        {unread ? <Button label="Segna tutte come lette" tone="secondary" onPress={() => readAll.mutate()} /> : null}
        {notices.data?.length ? (
          <Card>
            {notices.data.map((notice) => (
              <ListItem
                key={notice.id}
                title={notice.title}
                subtitle={`${notice.body} · ${when(notice.createdAt)}`}
                leading={
                  <Ionicons
                    name={notice.readAt ? "notifications-outline" : "notifications"}
                    size={18}
                    color={notice.readAt ? theme.colors.inkSoft : theme.colors.accent}
                  />
                }
                onPress={() => {
                  if (notice.readAt) openHref(router, notice.href);
                  else readOne.mutate(notice);
                }}
              />
            ))}
          </Card>
        ) : (
          <EmptyState title="Nessun avviso" message="Qui arrivano appuntamenti, scorte basse, turni e comande ferme." />
        )}
      </QueryState>
    </Screen>
  );
}
