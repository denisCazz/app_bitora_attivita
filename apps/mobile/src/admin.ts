import type { CategoryNode, ModuleDefRow, ResolvedCategory } from "@rapportini/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { http } from "./api/client";
import { queryClient } from "./api/query";

export type AdminCategory = CategoryNode & { tenantCount: number };

export interface AdminCatalog {
  categories: AdminCategory[];
  modules: ModuleDefRow[];
  permissions: string[];
}

export function useAdminCatalog() {
  return useQuery({ queryKey: ["admin", "catalog"], queryFn: () => http.get<AdminCatalog>("/admin/catalog"), staleTime: 0 });
}

export function useCategoryPreview(id: string) {
  return useQuery({ queryKey: ["admin", "preview", id], queryFn: () => http.get<ResolvedCategory>(`/admin/categories/${id}/preview`), staleTime: 0 });
}

export function useAdminMutation<T>(fn: (input: T) => Promise<unknown>) {
  return useMutation({
    mutationFn: fn,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin"] });
      await queryClient.invalidateQueries({ queryKey: ["manifest"] });
    },
  });
}

export function childrenOf(categories: AdminCategory[], parentId: string | null) {
  return categories.filter((category) => category.parentId === parentId);
}

export function euros(cents: number) {
  return (cents / 100).toFixed(2).replace(".", ",");
}

export function cents(value: string) {
  const parsed = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100)) : 0;
}
