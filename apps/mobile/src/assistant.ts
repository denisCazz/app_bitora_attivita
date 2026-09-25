import { File as FsFile } from "expo-file-system";
import { create } from "zustand";
import { api, API_URL } from "./api/client";
import { queryClient } from "./api/query";
import { useAuth } from "./auth/store";

type ServerMessage = Record<string, unknown>;

export interface PendingAction {
  id: string;
  title: string;
  summary: string;
}

interface DoneAction {
  title: string;
  summary: string;
  ok: boolean;
  error?: string;
}

interface ChatResponse {
  messages: ServerMessage[];
  reply: string | null;
  pending: PendingAction[];
  done: DoneAction[];
  speech: string | null;
}

export interface Turn {
  reply: string | null;
  pending: PendingAction[];
  speech: string | null;
  held: Entry | null;
}

interface ChatOptions {
  voice?: boolean;
}

export type Entry =
  | { id: string; kind: "user"; text: string }
  | { id: string; kind: "assistant"; text: string }
  | { id: string; kind: "action"; text: string; ok: boolean };

interface AssistantState {
  owner: string | null;
  entries: Entry[];
  messages: ServerMessage[];
  pending: PendingAction[];
  busy: boolean;
  error: string | null;
  bind: (owner: string) => void;
  send: (text: string, options?: ChatOptions) => Promise<Turn | null>;
  decide: (approve: boolean, options?: ChatOptions) => Promise<Turn | null>;
  reveal: (entry: Entry | null) => void;
  reset: () => void;
}

let counter = 0;
const nextId = () => `${Date.now()}-${counter++}`;
const EMPTY = { entries: [], messages: [], pending: [], error: null, busy: false };

export const useAssistant = create<AssistantState>((set, get) => {
  async function chat(body: { text?: string; decision?: "approve" | "reject" }, options: ChatOptions = {}): Promise<Turn | null> {
    const owner = get().owner;
    set({ busy: true, error: null });
    try {
      const result = await api<ChatResponse>("POST", "/assistant/chat", { messages: get().messages, ...body, voice: Boolean(options.voice) }, { force: true });
      if (get().owner !== owner) return null;
      const added: Entry[] = result.done.map((action) => ({
        id: nextId(),
        kind: "action",
        ok: action.ok,
        text: action.ok ? action.summary : `${action.summary}: ${action.error ?? "non riuscito"}`,
      }));
      const reply: Entry | null = result.reply?.trim() ? { id: nextId(), kind: "assistant", text: result.reply.trim() } : null;
      const held = options.voice && result.speech ? reply : null;
      if (reply && !held) added.push(reply);
      set((state) => ({ messages: result.messages, pending: result.pending, entries: [...state.entries, ...added] }));
      if (result.done.some((action) => action.ok)) void queryClient.invalidateQueries();
      return { reply: reply?.text ?? null, pending: result.pending, speech: result.speech, held };
    } catch (error) {
      if (get().owner === owner) set({ error: error instanceof Error ? error.message : "Assistente non raggiungibile" });
      return null;
    } finally {
      if (get().owner === owner) set({ busy: false });
    }
  }

  return {
    owner: null,
    ...EMPTY,
    bind: (owner) => {
      if (get().owner !== owner) set({ owner, ...EMPTY });
    },
    send: async (text, options) => {
      const trimmed = text.trim();
      if (!trimmed || get().busy) return null;
      set((state) => ({ entries: [...state.entries, { id: nextId(), kind: "user", text: trimmed }], pending: [] }));
      return chat({ text: trimmed }, options);
    },
    decide: async (approve, options) => {
      if (get().busy || !get().pending.length) return null;
      set({ pending: [] });
      return chat({ decision: approve ? "approve" : "reject" }, options);
    },
    reveal: (entry) => {
      if (!entry || get().entries.some((item) => item.id === entry.id)) return;
      set((state) => ({ entries: [...state.entries, entry] }));
    },
    reset: () => set(EMPTY),
  };
});

useAuth.subscribe((state, previous) => {
  if (previous.accessToken && !state.accessToken) useAssistant.setState({ owner: null, ...EMPTY });
});

export function spokenText(turn: Turn): string {
  const parts = [turn.reply ?? ""];
  if (turn.pending.length) parts.push(`${turn.pending.map((action) => action.summary).join(". ")}. Confermi?`);
  return parts.filter(Boolean).join(" ").trim();
}

export type Speech = { id: string } | { text: string };

export function speechSource(speech: Speech) {
  const token = useAuth.getState().accessToken;
  const path = "id" in speech ? `/assistant/speech/${speech.id}` : `/assistant/speech?text=${encodeURIComponent(speech.text.slice(0, 1500))}`;
  return { uri: `${API_URL}${path}`, headers: token ? { authorization: `Bearer ${token}` } : undefined };
}

export function turnSpeech(turn: Turn): Speech | null {
  if (turn.speech) return { id: turn.speech };
  const text = spokenText(turn);
  return text ? { text } : null;
}

export function voiceAnswer(text: string): "approve" | "reject" | null {
  const value = text.toLowerCase().trim();
  const end = "(?=$|[\\s,.!?])";
  if (new RegExp(`^(s[iì]|ok|okay|va bene|conferm\\w*|procedi|vai|certo|esatto|giusto|perfetto)${end}`).test(value)) return "approve";
  if (new RegExp(`^(no|annulla|lascia stare|stop|aspetta|fermo)${end}`).test(value)) return "reject";
  return null;
}

export async function transcribeRecording(uri: string): Promise<string> {
  const form = new FormData();
  form.append("file", new FsFile(uri) as unknown as Blob, "voce.m4a");
  const result = await api<{ text: string }>("POST", "/assistant/transcribe", undefined, { form });
  return result.text;
}
