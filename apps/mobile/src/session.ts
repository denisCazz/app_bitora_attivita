import { DEFAULT_LEDGER, hasPermission, isModuleKey, isUsable, MODULE_CODE, type Manifest, type ModuleKey, type Vocab, type VocabItem } from "@rapportini/shared";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useSyncExternalStore } from "react";
import { ApiError, http } from "./api/client";
import { queryClient } from "./api/query";
import { useAuth } from "./auth/store";

interface Account {
  platformAdmin: boolean;
  activeTenantId: string | null;
  memberships: Array<{ tenantId: string }>;
}

interface RepairState {
  status: "idle" | "pending" | "done" | "failed";
  platformAdmin: boolean;
}

let repairState: RepairState = { status: "idle", platformAdmin: false };
let repairStarted = false;
const repairListeners = new Set<() => void>();

function setRepair(status: RepairState["status"], platformAdmin = repairState.platformAdmin) {
  repairState = { status, platformAdmin };
  for (const listener of repairListeners) listener();
}

export function useTenantRepairState() {
  return useSyncExternalStore(
    (listener) => {
      repairListeners.add(listener);
      return () => repairListeners.delete(listener);
    },
    () => repairState,
    () => repairState,
  );
}

/** Token without a shop. If the account already has one, issue a session for it. */
export async function ensureTenantSession(): Promise<{ ok: boolean; platformAdmin: boolean }> {
  const me = await http.get<Account>("/me");
  const platformAdmin = Boolean(me.platformAdmin);
  const tenantId = me.activeTenantId ?? me.memberships[0]?.tenantId;
  if (!tenantId) return { ok: false, platformAdmin };
  const session = await http.post<{ accessToken: string; refreshToken: string }>("/me/tenant", { tenantId });
  await useAuth.getState().setSession(session.accessToken, session.refreshToken);
  return { ok: true, platformAdmin };
}

export function useTenantRepair(needsShop: boolean) {
  const token = useAuth((state) => state.accessToken);
  useEffect(() => {
    if (!token || !needsShop) {
      if (repairState.status !== "pending") repairStarted = false;
      return;
    }
    if (repairStarted) return;
    repairStarted = true;
    setRepair("pending");
    void ensureTenantSession()
      .then(async (result) => {
        if (result.ok) await queryClient.invalidateQueries({ queryKey: ["manifest"] });
        setRepair(result.ok ? "done" : "failed", result.platformAdmin);
      })
      .catch(() => setRepair("failed"));
  }, [needsShop, token]);
}

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

const EMPTY_VOCAB: Vocab = { scheduleKinds: [], stations: [], dashboard: [], ledger: DEFAULT_LEDGER };

export function useVocab(): Vocab {
  const vocab = useManifest().data?.tenant?.vocab;
  return vocab
    ? {
        scheduleKinds: vocab.scheduleKinds ?? [],
        stations: vocab.stations ?? [],
        dashboard: vocab.dashboard ?? [],
        ledger: vocab.ledger ?? DEFAULT_LEDGER,
      }
    : EMPTY_VOCAB;
}

export function vocabLabel(items: readonly VocabItem[], key: string) {
  return items.find((item) => item.key === key)?.label ?? key;
}

export function can(manifest: Manifest | undefined, permission: string) {
  return manifest?.role.permissions.includes(permission) ?? false;
}

export function modulePermitted(manifest: Manifest | undefined, key: string) {
  if (!manifest || !isModuleKey(key)) return false;
  return hasPermission(manifest.role.permissions, MODULE_CODE[key].permission);
}
