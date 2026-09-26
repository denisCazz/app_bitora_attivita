import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useRef, useState } from "react";

const STORAGE_KEY = "home-actions";

type Store = Record<string, string[]>;

function parseStore(raw: string | null): Store {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return value as Store;
  } catch {
    return {};
  }
}

/** `null` means every candidate stays visible, including modules added later. */
export function pickHomeActions<T extends { key: string }>(candidates: T[], selected: string[] | null): T[] {
  if (!selected) return candidates;
  const wanted = new Set(selected);
  return candidates.filter((item) => wanted.has(item.key));
}

export function nextHomeActions(candidateKeys: string[], selected: string[] | null, key: string, on: boolean): string[] | null {
  const current = new Set(selected ?? candidateKeys);
  if (on) current.add(key);
  else current.delete(key);
  const next = candidateKeys.filter((item) => current.has(item));
  return next.length === candidateKeys.length ? null : next;
}

export function useHomeActions(userId: string | undefined, tenantId: string | undefined) {
  const scope = userId && tenantId ? `${userId}:${tenantId}` : null;
  const [selected, setSelected] = useState<string[] | null>(null);
  const [ready, setReady] = useState(false);
  const latest = useRef<string[] | null>(null);
  const writes = useRef(Promise.resolve());

  useEffect(() => {
    if (!scope) return;
    let cancelled = false;
    setReady(false);
    void AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (cancelled) return;
      const stored = parseStore(raw)[scope];
      const keys = Array.isArray(stored) ? stored.filter((key) => typeof key === "string") : null;
      latest.current = keys;
      setSelected(keys);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [scope]);

  function persist(target: string, keys: string[] | null) {
    writes.current = writes.current
      .then(async () => {
        const store = parseStore(await AsyncStorage.getItem(STORAGE_KEY));
        if (keys) store[target] = keys;
        else delete store[target];
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(store));
      })
      .catch(() => undefined);
  }

  function save(keys: string[] | null) {
    latest.current = keys;
    setSelected(keys);
    if (scope) persist(scope, keys);
  }

  function toggle(candidateKeys: string[], key: string, on: boolean) {
    save(nextHomeActions(candidateKeys, latest.current, key, on));
  }

  return { selected, ready, save, toggle };
}
