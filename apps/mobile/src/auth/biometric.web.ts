import { create } from "zustand";

interface LockState {
  ready: boolean;
  enabled: boolean;
  locked: boolean;
}

export const useBiometricLock = create<LockState>(() => ({ ready: true, enabled: false, locked: false }));

export async function biometricLabel(): Promise<string | null> {
  return null;
}

export async function hydrateBiometric(_hasSession: boolean) {}

export function watchAppState() {
  return () => undefined;
}

export async function unlock() {}

export async function setBiometricEnabled(_enabled: boolean) {
  return false;
}

export async function forgetBiometric() {}

export async function offerBiometric() {}
