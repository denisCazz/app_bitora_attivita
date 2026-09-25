import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { create } from "zustand";

const ACCESS = "rapportini.access";
const REFRESH = "rapportini.refresh";

async function read(key: string): Promise<string | null> {
  if (Platform.OS === "web") return typeof localStorage === "undefined" ? null : localStorage.getItem(key);
  return SecureStore.getItemAsync(key);
}

async function write(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    localStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function remove(key: string): Promise<void> {
  if (Platform.OS === "web") {
    localStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setSession: (accessToken: string, refreshToken: string) => Promise<void>;
  clear: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  accessToken: null,
  refreshToken: null,
  hydrated: false,
  hydrate: async () => {
    try {
      const [accessToken, refreshToken] = await Promise.all([read(ACCESS), read(REFRESH)]);
      set({ accessToken, refreshToken, hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },
  setSession: async (accessToken, refreshToken) => {
    await Promise.all([write(ACCESS, accessToken), write(REFRESH, refreshToken)]);
    set({ accessToken, refreshToken });
  },
  clear: async () => {
    await Promise.all([remove(ACCESS), remove(REFRESH)]);
    set({ accessToken: null, refreshToken: null });
  },
}));
