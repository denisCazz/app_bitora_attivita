import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { File as ExpoFile, Paths } from "expo-file-system";
import { Platform } from "react-native";
import { useAuth } from "../auth/store";

function apiUrl(): string {
  // Sul web aperto da questo computer l'API è sempre quella locale. EXPO_PUBLIC_API_URL
  // spesso è un tunnel per il telefono: quando scade il browser riceve "Failed to fetch".
  if (Platform.OS === "web" && typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") return `http://${host}:3001`;
  }
  const configured = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (configured) return configured;
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  if (host) return `http://${host}:3001`;
  return "http://localhost:3001";
}

export const API_URL = apiUrl();
const QUEUE_KEY = "rapportini.queue";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

type QueueItem = { id: string; method: string; path: string; body?: unknown };

let online = true;
let refreshing: Promise<boolean> | null = null;

export function setOnline(value: boolean) {
  online = value;
  if (value) void flushQueue();
}

async function readQueue(): Promise<QueueItem[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  return raw ? (JSON.parse(raw) as QueueItem[]) : [];
}

async function refresh(): Promise<boolean> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const refreshToken = useAuth.getState().refreshToken;
    if (!refreshToken) return false;
    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!response.ok) {
      await useAuth.getState().clear();
      return false;
    }
    const data = (await response.json()) as { accessToken: string; refreshToken: string };
    await useAuth.getState().setSession(data.accessToken, data.refreshToken);
    return true;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

function unreachable(error: unknown): never {
  if (error instanceof TypeError) throw new ApiError("Non riesco a raggiungere il server. Controlla che l'API sia avviata.", 0);
  throw error;
}

async function send(method: string, path: string, body?: unknown, form?: FormData): Promise<Response> {
  const headers: Record<string, string> = {};
  const token = useAuth.getState().accessToken;
  if (token) headers.authorization = `Bearer ${token}`;
  if (body && !form) headers["content-type"] = "application/json";
  const call = () =>
    fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: form ?? (body ? JSON.stringify(body) : undefined),
    }).catch(unreachable);
  let response = await call();
  if (response.status === 401 && token && path !== "/auth/refresh") {
    const ok = await refresh().catch(() => false);
    if (ok) {
      headers.authorization = `Bearer ${useAuth.getState().accessToken}`;
      response = await call();
    }
  }
  return response;
}

export async function api<T>(method: string, path: string, body?: unknown, options?: { form?: FormData; force?: boolean }): Promise<T> {
  if (!online && method !== "GET" && !options?.form && !options?.force) {
    const queue = await readQueue();
    queue.push({ id: `${Date.now()}`, method, path, body });
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    return { queued: true } as T;
  }
  const response = await send(method, path, body, options?.form);
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(data.error ?? "Richiesta non riuscita", response.status);
  }
  const type = response.headers.get("content-type") ?? "";
  if (type.includes("application/pdf")) return response as T;
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export interface LocalFile {
  uri: string;
  name: string;
  type: string;
  /** File del browser, quando il picker web lo fornisce. */
  blob?: Blob;
}

/**
 * expo/fetch (il fetch globale da SDK 54) non sa leggere `{ uri, name, type }`.
 * Sul telefono serve un File di expo-file-system, che espone i byte.
 */
async function uploadPart(file: LocalFile): Promise<{ part: Blob; cleanup?: () => void }> {
  if (Platform.OS === "web") {
    const blob = file.blob ?? (await (await fetch(file.uri)).blob());
    return { part: blob };
  }
  const source = new ExpoFile(file.uri);
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_") || "foto.jpg";
  if (source.name === safeName) return { part: source as unknown as Blob };
  const dest = new ExpoFile(Paths.cache, safeName);
  try {
    if (dest.exists) dest.delete();
    await source.copy(dest);
    return {
      part: dest as unknown as Blob,
      cleanup: () => {
        if (dest.exists) dest.delete();
      },
    };
  } catch {
    return { part: source as unknown as Blob };
  }
}

export async function upload<T>(path: string, file: LocalFile, fields: Record<string, string> = {}): Promise<T> {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  const { part, cleanup } = await uploadPart(file);
  if (Platform.OS === "web") form.append("file", part, file.name);
  else form.append("file", part);
  try {
    return await api<T>("POST", path, undefined, { form });
  } finally {
    cleanup?.();
  }
}

/** I file locali dell'API possono avere un host che il telefono non raggiunge (es. localhost). */
export function mediaUrl(url: string) {
  const index = url.indexOf("/uploads/");
  return index >= 0 ? `${API_URL}${url.slice(index)}` : url;
}

export async function clearQueue() {
  await AsyncStorage.removeItem(QUEUE_KEY);
}

export async function flushQueue() {
  const queue = await readQueue();
  const pending: QueueItem[] = [];
  for (const [index, item] of queue.entries()) {
    try {
      await api(item.method, item.path, item.body, { force: true });
    } catch {
      pending.push(...queue.slice(index));
      break;
    }
  }
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(pending));
}

export const http = {
  get: <T>(path: string) => api<T>("GET", path),
  post: <T>(path: string, body?: unknown) => api<T>("POST", path, body),
  patch: <T>(path: string, body?: unknown) => api<T>("PATCH", path, body),
  put: <T>(path: string, body?: unknown) => api<T>("PUT", path, body),
  del: <T>(path: string, body?: unknown) => api<T>("DELETE", path, body),
};
