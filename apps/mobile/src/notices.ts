import { useQuery } from "@tanstack/react-query";
import { http } from "./api/client";

export interface Notice {
  id: string;
  title: string;
  body: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
}

export function useNotices(enabled: boolean) {
  return useQuery({
    queryKey: ["notifications"],
    queryFn: () => http.get<Notice[]>("/notifications"),
    enabled,
    refetchInterval: 60_000,
  });
}
