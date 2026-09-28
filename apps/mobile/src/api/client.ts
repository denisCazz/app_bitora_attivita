import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { Directory, File as ExpoFile, Paths } from "expo-file-system";
import { Platform } from "react-native";
import { create } from "zustand";
import { useAuth } from "../auth/store";
import { queryClient } from "./query";

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

const OFFLINE_MESSAGE = "Sei offline: questa operazione ha bisogno della rete.";
const RETRY_MS = 30_000;

interface StoredFile {
  uri: string;
  name: string;
  type: string;
}

interface QueueBase {
  /** Also the Idempotency-Key, so a resend after a lost response is applied once. */
  id: string;
  /** Shown to the user if the server later refuses the change. */
  label?: string;
  /** `userId:tenantId` of the session that made the change. */
  owner?: string | null;
}

type QueueItem =
  | (QueueBase & { kind?: "json"; method: string; path: string; body?: unknown })
  | (QueueBase & { kind: "upload"; path: string; file: StoredFile; fields: Record<string, string> });

/** Returned instead of the server response when a change waits in the queue. */
export interface Queued {
  queued: true;
  id: string;
  /** Local copy of a queued photo, for showing it before it is uploaded. */
  uri?: string;
}

export function isQueued(value: unknown): value is Queued {
  return typeof value === "object" && value !== null && (value as { queued?: unknown }).queued === true;
}

export interface OutboxFailure {
  id: string;
  label: string;
  error: string;
}

interface OutboxState {
  pending: number;
  sending: boolean;
  failed: OutboxFailure[];
  dismiss: (id: string) => void;
}

export const useOutbox = create<OutboxState>((set) => ({
  pending: 0,
  sending: false,
  failed: [],
  dismiss: (id) => set((state) => ({ failed: state.failed.filter((failure) => failure.id !== id) })),
}));

let online = true;
let refreshing: Promise<boolean> | null = null;

export function setOnline(value: boolean) {
  online = value;
  if (value) void flushQueue();
}

function newKey(): string {
  const random = Array.from({ length: 4 }, () => Math.random().toString(36).slice(2, 8)).join("");
  return `${Date.now().toString(36)}${random}`;
}

function sessionOwner(): string | null {
  const token = useAuth.getState().accessToken;
  const part = token?.split(".")[1];
  if (!part) return null;
  const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
  try {
    const payload = JSON.parse(atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "="))) as { sub?: string; tenantId?: string };
    return payload.sub ? `${payload.sub}:${payload.tenantId ?? ""}` : null;
  } catch {
    return null;
  }
}

let queueLock: Promise<unknown> = Promise.resolve();

/** Every read-modify-write of the stored queue goes through here, or concurrent writers drop items. */
function exclusive<T>(task: () => Promise<T>): Promise<T> {
  const run = queueLock.then(task, task);
  queueLock = run.catch(() => undefined);
  return run;
}

async function readQueue(): Promise<QueueItem[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  return raw ? (JSON.parse(raw) as QueueItem[]) : [];
}

async function writeQueue(queue: QueueItem[]) {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  useOutbox.setState({ pending: queue.length });
}

function enqueue(item: QueueItem) {
  return exclusive(async () => writeQueue([...(await readQueue()), item]));
}

function dropFile(item: QueueItem) {
  if (item.kind !== "upload") return;
  try {
    const file = new ExpoFile(item.file.uri);
    if (file.exists) file.delete();
  } catch {
    // Già sparito: niente da pulire.
  }
}

function removeQueued(id: string) {
  return exclusive(async () => {
    const queue = await readQueue();
    queue.filter((item) => item.id === id).forEach(dropFile);
    await writeQueue(queue.filter((item) => item.id !== id));
  });
}

/** Forgets a change that has not been sent yet, e.g. a photo deleted before upload. */
export function discardQueued(id: string) {
  return removeQueued(id);
}

export async function refreshOutbox() {
  useOutbox.setState({ pending: (await readQueue()).length });
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

async function send(method: string, path: string, body?: unknown, form?: FormData, idempotencyKey?: string): Promise<Response> {
  const headers: Record<string, string> = {};
  const token = useAuth.getState().accessToken;
  if (token) headers.authorization = `Bearer ${token}`;
  if (body && !form) headers["content-type"] = "application/json";
  if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;
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
  if (!online && method !== "GET" && !options?.force) throw new ApiError(OFFLINE_MESSAGE, 0);
  return parse<T>(await send(method, path, body, options?.form));
}

async function parse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
    // Fastify's own 404 means the server predates this app build.
    const outdated = response.status === 404 && !data.error && /^Route .+ not found$/.test(data.message ?? "");
    const message = outdated ? "Funzione non ancora attiva sul server: aggiorna il server e riprova." : (data.error ?? data.message ?? "Richiesta non riuscita");
    throw new ApiError(message, response.status);
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

async function postFile(path: string, file: LocalFile, fields: Record<string, string>, idempotencyKey?: string): Promise<Response> {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  const { part, cleanup } = await uploadPart(file);
  if (Platform.OS === "web") form.append("file", part, file.name);
  else form.append("file", part);
  try {
    return await send("POST", path, undefined, form, idempotencyKey);
  } finally {
    cleanup?.();
  }
}

export async function upload<T>(path: string, file: LocalFile, fields: Record<string, string> = {}): Promise<T> {
  if (!online) throw new ApiError(OFFLINE_MESSAGE, 0);
  return parse<T>(await postFile(path, file, fields));
}

function unreachableError(error: unknown) {
  return error instanceof ApiError && error.status === 0;
}

async function queueable<T>(method: string, path: string, body: unknown, label: string): Promise<T | Queued> {
  const item: QueueItem = { id: newKey(), method, path, body, label, owner: sessionOwner() };
  if (online) {
    try {
      return await parse<T>(await send(method, path, body, undefined, item.id));
    } catch (error) {
      if (!unreachableError(error)) throw error;
    }
  }
  await enqueue(item);
  return { queued: true, id: item.id };
}

/** Photos wait in the app's documents, which the system does not clean up like the cache. */
async function keepFile(id: string, file: LocalFile): Promise<StoredFile> {
  const folder = new Directory(Paths.document, "outbox");
  folder.create({ intermediates: true, idempotent: true });
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_") || "foto.jpg";
  const dest = new ExpoFile(folder, `${id}-${safeName}`);
  await new ExpoFile(file.uri).copy(dest);
  return { uri: dest.uri, name: file.name, type: file.type };
}

async function queueableUpload<T>(path: string, file: LocalFile, fields: Record<string, string>, label: string): Promise<T | Queued> {
  // Sul web il file del browser non sopravvive a un ricaricamento: niente coda.
  if (Platform.OS === "web") return upload<T>(path, file, fields);
  const id = newKey();
  if (online) {
    try {
      return await parse<T>(await postFile(path, file, fields, id));
    } catch (error) {
      if (!unreachableError(error)) throw error;
    }
  }
  const stored = await keepFile(id, file);
  await enqueue({ id, kind: "upload", path, file: stored, fields, label, owner: sessionOwner() });
  return { queued: true, id, uri: stored.uri };
}

/**
 * Field work that must survive a missing signal: when offline the change is stored, sent later
 * exactly once, and the caller gets `Queued` instead of the server response.
 */
export const outbox = {
  post: <T>(path: string, body: unknown, label: string) => queueable<T>("POST", path, body, label),
  patch: <T>(path: string, body: unknown, label: string) => queueable<T>("PATCH", path, body, label),
  del: <T>(path: string, label: string) => queueable<T>("DELETE", path, undefined, label),
  upload: <T>(path: string, file: LocalFile, fields: Record<string, string>, label: string) => queueableUpload<T>(path, file, fields, label),
};

/** I file locali dell'API possono avere un host che il telefono non raggiunge (es. localhost). */
export function mediaUrl(url: string) {
  const index = url.indexOf("/uploads/");
  return index >= 0 ? `${API_URL}${url.slice(index)}` : url;
}

export async function clearQueue() {
  await exclusive(async () => {
    (await readQueue()).forEach(dropFile);
    await AsyncStorage.removeItem(QUEUE_KEY);
  });
  useOutbox.setState({ pending: 0, sending: false, failed: [] });
}

/** Network trouble, an expired session or a busy server: the same request can succeed later. */
function worthRetrying(response: Response) {
  const status = response.status;
  if (status === 409) return response.headers.has("retry-after");
  return status === 401 || status === 408 || status === 425 || status === 429 || status >= 500;
}

async function deliver(item: QueueItem): Promise<"sent" | "retry" | { error: string }> {
  try {
    let response: Response;
    if (item.kind === "upload") {
      if (!new ExpoFile(item.file.uri).exists) return { error: "La foto non è più sul telefono" };
      response = await postFile(item.path, item.file, item.fields, item.id);
    } else {
      response = await send(item.method, item.path, item.body, undefined, item.id);
    }
    if (response.ok) return "sent";
    if (worthRetrying(response)) return "retry";
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    return { error: data.error ?? "Il server ha rifiutato la modifica" };
  } catch {
    return "retry";
  }
}

let draining: Promise<void> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

export function flushQueue(): Promise<void> {
  draining ??= drain().finally(() => {
    draining = null;
  });
  return draining;
}

async function drain() {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  const owner = sessionOwner();
  if (!online || !owner) return;
  let delivered = false;
  let stalled = false;
  try {
    for (;;) {
      // Changes made by another account or shop on this device wait until that session is back.
      const item = (await readQueue()).find((entry) => (entry.owner ?? owner) === owner);
      if (!item) break;
      useOutbox.setState({ sending: true });
      const outcome = await deliver(item);
      if (outcome === "retry") {
        stalled = true;
        break;
      }
      await removeQueued(item.id);
      delivered = true;
      if (outcome !== "sent") {
        const failure = { id: item.id, label: item.label ?? "Modifica", error: outcome.error };
        useOutbox.setState((state) => ({ failed: [...state.failed, failure] }));
      }
    }
  } finally {
    useOutbox.setState({ sending: false });
  }
  if (delivered) await queryClient.invalidateQueries();
  if (stalled && online) retryTimer = setTimeout(() => void flushQueue(), RETRY_MS);
}

export const http = {
  get: <T>(path: string) => api<T>("GET", path),
  post: <T>(path: string, body?: unknown) => api<T>("POST", path, body),
  patch: <T>(path: string, body?: unknown) => api<T>("PATCH", path, body),
  put: <T>(path: string, body?: unknown) => api<T>("PUT", path, body),
  del: <T>(path: string, body?: unknown) => api<T>("DELETE", path, body),
};
