import { isUsable, type Manifest, type ModuleKey } from "@rapportini/shared";
import { useQuery } from "@tanstack/react-query";
import { ApiError, http } from "./api/client";
import { useAuth } from "./auth/store";

export function useManifest() {
  const token = useAuth((state) => state.accessToken);
  return useQuery({
    queryKey: ["manifest"],
    queryFn: () => http.get<Manifest>("/me/manifest"),
    enabled: Boolean(token),
    retry: (count, error) => !(error instanceof ApiError && (error.status === 409 || error.status === 401)) && count < 1,
  });
}

export function useCanUse(key: ModuleKey) {
  const manifest = useManifest();
  return manifest.data?.modules.some((module) => module.key === key && isUsable(module.status)) ?? false;
}

export function can(manifest: Manifest | undefined, permission: string) {
  return manifest?.role.permissions.includes(permission) ?? false;
}
