import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { useAuth } from "../auth/store";

function apiUrl(): string {
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

async function send(method: string, path: string, body?: unknown, form?: FormData): Promise<Response> {
  const headers: Record<string, string> = {};
  const token = useAuth.getState().accessToken;
  if (token) headers.authorization = `Bearer ${token}`;
  if (body && !form) headers["content-type"] = "application/json";
  let response = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: form ?? (body ? JSON.stringify(body) : undefined),
  });
  if (response.status === 401 && token && path !== "/auth/refresh") {
    const ok = await refresh();
    if (ok) {
      headers.authorization = `Bearer ${useAuth.getState().accessToken}`;
      response = await fetch(`${API_URL}${path}`, {
        method,
        headers,
        body: form ?? (body ? JSON.stringify(body) : undefined),
      });
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
  del: <T>(path: string) => api<T>("DELETE", path),
};
