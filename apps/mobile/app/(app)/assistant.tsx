import { Ionicons } from "@expo/vector-icons";
import { setAudioModeAsync, useAudioRecorder } from "expo-audio";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Backdrop, Button, Card, Glass, Pressy, Text, useTheme } from "@rapportini/ui";
import { useAiConsent } from "../../src/account";
import { transcribeRecording, turnSpeech, useAssistant, type Entry } from "../../src/assistant";
import { AiConsent } from "../../src/components/AiConsent";
import { LiveTalk } from "../../src/components/LiveTalk";
import { goBack } from "../../src/navigation";
import { useCanUse, useManifest } from "../../src/session";
import { beginRecording, RECORDING_OPTIONS, useSpeaker } from "../../src/voice";

function Bubble({ entry }: { entry: Entry }) {
  const theme = useTheme();
  if (entry.kind === "action") {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 4 }}>
        <Ionicons name={entry.ok ? "checkmark-circle" : "alert-circle"} size={18} color={entry.ok ? theme.colors.success : theme.colors.danger} />
        <Text variant="caption" muted style={{ flex: 1 }}>
          {entry.text}
        </Text>
      </View>
    );
  }
  if (entry.kind === "user") {
    return (
      <View style={{ alignSelf: "flex-end", maxWidth: "85%", borderRadius: 20, borderBottomRightRadius: 6, overflow: "hidden" }}>
        <LinearGradient colors={[theme.colors.accent, theme.colors.accentAlt]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <Text style={{ color: theme.colors.accentInk, paddingHorizontal: 14, paddingVertical: 10 }}>{entry.text}</Text>
      </View>
    );
  }
  return (
    <Glass rounded={20} style={{ alignSelf: "flex-start", maxWidth: "88%", borderBottomLeftRadius: 6 }}>
      <Text style={{ paddingHorizontal: 14, paddingVertical: 10 }}>{entry.text}</Text>
    </Glass>
  );
}

export default function AssistantScreen() {
  const consent = useAiConsent();
  if (consent.loading) return null;
  if (!consent.granted) return <AiConsent onBack={() => goBack()} />;
  return <AssistantChat />;
}

function AssistantChat() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollView>(null);
  const manifest = useManifest().data;
  const owner = manifest ? `${manifest.user.id}:${manifest.tenant.id}` : null;
  const store = useAssistant();
  const { busy, error, send, decide, reset, bind, reveal } = store;
  const current = Boolean(owner) && store.owner === owner;
  const entries = current ? store.entries : [];
  const pending = current ? store.pending : [];
  const speaker = useSpeaker();
  const [live, setLive] = useState(false);
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recorder = useAudioRecorder(RECORDING_OPTIONS);
  const orders = useCanUse("orders");
  const workOrders = useCanUse("work_orders");

  const examples = [
    orders ? "Tavolo 2: una Coca-Cola e un tiramisù" : null,
    orders ? "Cosa c'è aperto adesso in sala?" : null,
    workOrders ? "Pianifica per domani alle 9 un intervento dal cliente Rossi" : null,
    workOrders ? "Quali interventi ho questa settimana?" : null,
  ].filter((item): item is string => Boolean(item));

  useEffect(() => {
    if (owner) bind(owner);
  }, [owner, bind]);

  useEffect(() => {
    const timer = setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(timer);
  }, [entries.length, pending.length, busy]);

  async function submit(value = text, aloud = false) {
    if (!value.trim() || !current) return;
    setText("");
    speaker.stop();
    const turn = await send(value, { voice: aloud });
    if (aloud && turn) await speaker.speak(turnSpeech(turn), () => reveal(turn.held));
  }

  async function stopAndSend() {
    setRecording(false);
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
    const uri = recorder.uri;
    if (!uri) throw new Error("Registrazione vuota, riprova.");
    setTranscribing(true);
    try {
      const heard = await transcribeRecording(uri);
      if (heard) await submit(heard, true);
      else setVoiceError("Non ho sentito niente, riprova.");
    } finally {
      setTranscribing(false);
    }
  }

  async function startRecording() {
    speaker.stop();
    await beginRecording(recorder);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setRecording(true);
  }

  async function toggleVoice() {
    setVoiceError(null);
    try {
      if (recording) await stopAndSend();
      else await startRecording();
    } catch (cause) {
      console.warn("[assistente] voce", cause);
      setRecording(false);
      setVoiceError(cause instanceof Error ? cause.message : "Microfono non disponibile");
    }
  }

  const shownError = voiceError ?? (current ? error : null);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.paper }}>
      <Backdrop />
      <View style={{ paddingTop: insets.top + theme.space.sm, paddingHorizontal: theme.space.lg, paddingBottom: theme.space.sm, flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Pressy onPress={() => goBack()} accessibilityRole="button" accessibilityLabel="Indietro" hitSlop={10} scaleTo={0.9} style={{ borderRadius: 22 }}>
          <Glass liquid interactive rounded={22} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="chevron-back" size={24} color={theme.colors.ink} />
          </Glass>
        </Pressy>
        <View style={{ flex: 1 }}>
          <Text variant="title">Assistente</Text>
          <Text variant="caption" muted>
            Risposte generate dall'IA, possono contenere errori. Chiedo conferma prima di modificare.
          </Text>
        </View>
        {entries.length ? (
          <Pressy onPress={reset} accessibilityRole="button" accessibilityLabel="Nuova conversazione" hitSlop={10}>
            <Ionicons name="create-outline" size={24} color={theme.colors.inkSoft} />
          </Pressy>
        ) : null}
        <Pressy
          onPress={() => {
            speaker.stop();
            setLive(true);
          }}
          disabled={!current}
          accessibilityRole="button"
          accessibilityLabel="Conversazione dal vivo"
          style={{ width: 40, height: 40, borderRadius: 20, overflow: "hidden", alignItems: "center", justifyContent: "center" }}
        >
          <LinearGradient colors={["#2A1206", "#150B24"]} style={StyleSheet.absoluteFill} />
          <Ionicons name="radio-outline" size={22} color="#F5B971" />
        </Pressy>
      </View>
      <LiveTalk visible={live} onClose={() => setLive(false)} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ padding: theme.space.lg, gap: theme.space.md, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          {entries.length === 0 ? (
            <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: theme.space.md, paddingVertical: theme.space.xxl }}>
              <Ionicons name="sparkles" size={40} color={theme.colors.accent} />
              <Text variant="heading" style={{ textAlign: "center" }}>
                Scrivi o parla come faresti con un collega
              </Text>
              <View style={{ gap: theme.space.sm, alignSelf: "stretch" }}>
                {examples.map((example) => (
                  <Pressy key={example} onPress={() => void submit(example)}>
                    <Glass rounded={16} style={{ paddingHorizontal: 14, paddingVertical: 12 }}>
                      <Text muted>“{example}”</Text>
                    </Glass>
                  </Pressy>
                ))}
              </View>
            </View>
          ) : (
            entries.map((entry) => (
              <Animated.View key={entry.id} entering={FadeInDown.duration(220)}>
                <Bubble entry={entry} />
              </Animated.View>
            ))
          )}
          {pending.length ? (
            <Animated.View entering={FadeInDown.duration(220)}>
              <Card style={{ gap: theme.space.md }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Ionicons name="shield-checkmark-outline" size={20} color={theme.colors.accent} />
                  <Text variant="heading">Confermi?</Text>
                </View>
                {pending.map((action) => (
                  <View key={action.id} style={{ gap: 2 }}>
                    <Text variant="label" muted>
                      {action.title}
                    </Text>
                    <Text>{action.summary}</Text>
                  </View>
                ))}
                <View style={{ flexDirection: "row", gap: theme.space.sm }}>
                  <Button label="Annulla" tone="secondary" style={{ flex: 1 }} onPress={() => void decide(false)} />
                  <Button label="Conferma" style={{ flex: 1 }} onPress={() => void decide(true)} />
                </View>
              </Card>
            </Animated.View>
          ) : null}
          {busy || transcribing ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 4 }}>
              <ActivityIndicator color={theme.colors.accent} />
              <Text variant="caption" muted>
                {transcribing ? "Trascrivo…" : "Ci penso…"}
              </Text>
            </View>
          ) : null}
          {shownError ? (
            <Text variant="caption" style={{ color: theme.colors.danger, paddingHorizontal: 4 }}>
              {shownError}
            </Text>
          ) : null}
        </ScrollView>
        <View style={{ paddingHorizontal: theme.space.lg, paddingTop: theme.space.sm, paddingBottom: Math.max(insets.bottom, theme.space.md) }}>
          <Glass rounded={28} style={{ flexDirection: "row", alignItems: "flex-end", gap: 6, padding: 6 }}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={recording ? "Ti ascolto… tocca di nuovo per inviare" : "Scrivi cosa fare…"}
              placeholderTextColor={theme.colors.inkSoft}
              multiline
              editable={!recording}
              style={{ flex: 1, minHeight: 44, maxHeight: 140, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 10, fontSize: 16, color: theme.colors.ink }}
            />
            {text.trim() ? (
              <Pressy onPress={() => void submit()} disabled={busy} accessibilityRole="button" accessibilityLabel="Invia" style={{ width: 44, height: 44, borderRadius: 22, overflow: "hidden", alignItems: "center", justifyContent: "center", opacity: busy ? 0.5 : 1 }}>
                <LinearGradient colors={[theme.colors.accent, theme.colors.accentAlt]} style={StyleSheet.absoluteFill} />
                <Ionicons name="arrow-up" size={22} color={theme.colors.accentInk} />
              </Pressy>
            ) : (
              <Pressy
                onPress={() => void toggleVoice()}
                disabled={busy || transcribing}
                accessibilityRole="button"
                accessibilityLabel={recording ? "Ferma e invia" : "Parla"}
                style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: recording ? theme.colors.danger : "transparent", opacity: busy || transcribing ? 0.5 : 1 }}
              >
                <Ionicons name={recording ? "stop" : "mic"} size={22} color={recording ? "#fff" : theme.colors.accent} />
              </Pressy>
            )}
          </Glass>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
