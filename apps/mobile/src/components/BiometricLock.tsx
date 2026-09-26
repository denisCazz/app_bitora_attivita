import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Modal, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Text } from "@rapportini/ui";
import { signOut } from "../account";
import { biometricLabel, unlock, useBiometricLock, watchAppState } from "../auth/biometric";
import { useAuth } from "../auth/store";

/** Covers the app until Face ID / Touch ID / fingerprint succeeds. */
export function BiometricLock() {
  const locked = useBiometricLock((state) => state.locked);
  const signedIn = useAuth((state) => Boolean(state.refreshToken));
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [label, setLabel] = useState("Face ID");
  const visible = locked && signedIn;

  useEffect(() => watchAppState(), []);

  useEffect(() => {
    void biometricLabel().then((value) => value && setLabel(value));
  }, []);

  useEffect(() => {
    if (visible) void unlock();
  }, [visible]);

  async function leave() {
    await signOut();
    router.replace("/(auth)/login");
  }

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={() => undefined}>
      <View style={{ flex: 1, backgroundColor: "#07080B", padding: 24, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24, justifyContent: "space-between" }}>
        <View />
        <View style={{ alignItems: "center", gap: 14 }}>
          <Ionicons name="lock-closed" size={44} color="#fff" />
          <Text variant="title" style={{ color: "#fff" }}>
            Bitora è bloccata
          </Text>
          <Text style={{ color: "rgba(255,255,255,0.7)", textAlign: "center" }}>Sblocca con {label} per continuare.</Text>
        </View>
        <View style={{ gap: 10 }}>
          <Button label={`Sblocca con ${label}`} onPress={() => void unlock()} />
          <Button label="Esci dall'account" tone="ghost" onPress={() => void leave()} />
        </View>
      </View>
    </Modal>
  );
}
