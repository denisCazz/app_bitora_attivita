import type { CategoryNode, ModuleDefRow, NeedRow, ResolvedCategory } from "@rapportini/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { http } from "./api/client";
import { queryClient } from "./api/query";

export type AdminCategory = CategoryNode & { tenantCount: number };

export interface AdminCatalog {
  categories: AdminCategory[];
  modules: ModuleDefRow[];
  needs: NeedRow[];
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

export interface AdminUserSummary {
  id: string;
  name: string;
  email: string;
  platformAdmin: boolean;
  createdAt: string;
  shops: Array<{ id: string; name: string; roleName: string; categoryLabel: string }>;
}

export interface AdminUserShop {
  id: string;
  name: string;
  roleName: string;
  category: { label: string; path: string[] };
  needs: Array<{ key: string; label: string }>;
  branding: { accent: string | null; logoUrl: string | null };
  terminology: Record<string, string>;
  modules: Array<{ key: string; label: string; enabled: boolean; licensed: boolean; free: boolean; trialEndsAt: string | null }>;
  fields: Array<{ id: string; entity: string; key: string; label: string; type: string; required: boolean; options: string[] }>;
  roles: Array<{ name: string; isSystem: boolean; permissions: string[] }>;
}

export interface AdminUserDetail extends Omit<AdminUserSummary, "shops"> {
  shops: AdminUserShop[];
}

export function useAdminUsers() {
  return useQuery({ queryKey: ["admin", "users"], queryFn: () => http.get<AdminUserSummary[]>("/admin/users"), staleTime: 0 });
}

export function useAdminUser(id: string) {
  return useQuery({ queryKey: ["admin", "users", id], queryFn: () => http.get<AdminUserDetail>(`/admin/users/${id}`), staleTime: 0 });
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
