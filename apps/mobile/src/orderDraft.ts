import { create } from "zustand";

export interface DraftLine {
  key: string;
  menuItemId?: string;
  name: string;
  unitPrice: number;
  station: string;
  quantity: number;
  modifierIds: string[];
  modifierNames: string[];
  note: string;
}

interface DraftState {
  drafts: Record<string, DraftLine[]>;
  add: (orderId: string, line: Omit<DraftLine, "key">) => void;
  change: (orderId: string, key: string, patch: Partial<DraftLine>) => void;
  remove: (orderId: string, key: string) => void;
  clear: (orderId: string) => void;
}

let counter = 0;

function sameLine(left: Omit<DraftLine, "key">, right: DraftLine) {
  return (
    Boolean(left.menuItemId) &&
    left.menuItemId === right.menuItemId &&
    !left.note.trim() &&
    !right.note.trim() &&
    left.modifierIds.length === right.modifierIds.length &&
    left.modifierIds.every((id) => right.modifierIds.includes(id))
  );
}

/** Voci che il cameriere sta scrivendo e non ha ancora inviato, per comanda. */
export const useOrderDraft = create<DraftState>((set) => ({
  drafts: {},
  add: (orderId, line) =>
    set((state) => {
      const lines = state.drafts[orderId] ?? [];
      const existing = lines.find((item) => sameLine(line, item));
      const next = existing
        ? lines.map((item) => (item === existing ? { ...item, quantity: Math.min(50, item.quantity + line.quantity) } : item))
        : [...lines, { ...line, key: `draft-${++counter}` }];
      return { drafts: { ...state.drafts, [orderId]: next } };
    }),
  change: (orderId, key, patch) =>
    set((state) => ({
      drafts: {
        ...state.drafts,
        [orderId]: (state.drafts[orderId] ?? []).flatMap((item) => {
          if (item.key !== key) return [item];
          const updated = { ...item, ...patch };
          return updated.quantity < 1 ? [] : [{ ...updated, quantity: Math.min(50, updated.quantity) }];
        }),
      },
    })),
  remove: (orderId, key) => set((state) => ({ drafts: { ...state.drafts, [orderId]: (state.drafts[orderId] ?? []).filter((item) => item.key !== key) } })),
  clear: (orderId) =>
    set((state) => {
      const { [orderId]: _removed, ...rest } = state.drafts;
      return { drafts: rest };
    }),
}));
