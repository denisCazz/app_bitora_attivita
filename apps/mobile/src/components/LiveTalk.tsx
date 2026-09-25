import { Ionicons } from "@expo/vector-icons";
import { setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from "expo-audio";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef, useState } from "react";
import { Modal, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Pressy, Text } from "@rapportini/ui";
import { spokenText, transcribeRecording, turnSpeech, useAssistant, voiceAnswer } from "../assistant";
import { beginRecording, RECORDING_OPTIONS, useSpeaker } from "../voice";

type Phase = "listening" | "thinking" | "speaking" | "paused";

const ORB = 190;
const EMBER = "#F5B971";
const PALETTES: Record<Phase, [string, string, string]> = {
  listening: ["#FFE0A3", "#F08A3C", "#9A2E12"],
  thinking: ["#C9A8FF", "#6D3FD6", "#1E0B4A"],
  speaking: ["#FFF1C9", "#F5B971", "#C2410C"],
  paused: ["#6B6470", "#3A3440", "#17141C"],
};
const LABELS: Record<Phase, string> = {
  listening: "Ti ascolto…",
  thinking: "Ci penso…",
  speaking: "Parlo… tocca per interrompermi",
  paused: "In pausa: tocca il cerchio per parlare",
};
const SILENCE_MS = 1300;
const IDLE_RESTART_MS = 15_000;

function Ripple({ delay, tint }: { delay: number; tint: string }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withDelay(delay, withRepeat(withTiming(1, { duration: 3600, easing: Easing.out(Easing.quad) }), -1, false));
    return () => cancelAnimation(progress);
  }, [delay, progress]);
  const style = useAnimatedStyle(() => ({ opacity: 0.55 * (1 - progress.value), transform: [{ scale: 1 + progress.value * 1.5 }] }));
  return <Animated.View pointerEvents="none" style={[styles.ring, { borderColor: tint }, style]} />;
}

function Constellation({ radius, count, duration, reverse }: { radius: number; count: number; duration: number; reverse?: boolean }) {
  const spin = useSharedValue(0);
  useEffect(() => {
    spin.value = withRepeat(withTiming(1, { duration, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(spin);
  }, [duration, spin]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${(reverse ? -360 : 360) * spin.value}deg` }] }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: "absolute", width: radius * 2, height: radius * 2 }, style]}>
      {Array.from({ length: count }, (_, index) => {
        const angle = (index / count) * Math.PI * 2;
        const size = index % 3 === 0 ? 9 : 5;
        return (
          <View
            key={index}
            style={{
              position: "absolute",
              left: radius + Math.cos(angle) * radius - size / 2,
              top: radius + Math.sin(angle) * radius - size / 2,
              width: size,
              height: size,
              borderRadius: index % 3 === 0 ? 1 : size,
              backgroundColor: EMBER,
              opacity: index % 2 ? 0.35 : 0.75,
              transform: [{ rotate: "45deg" }],
              shadowColor: EMBER,
              shadowOpacity: 0.9,
              shadowRadius: 6,
            }}
          />
        );
      })}
    </Animated.View>
  );
}

function Orb({ phase, level }: { phase: Phase; level: SharedValue<number> }) {
  const swirl = useSharedValue(0);
  const breath = useSharedValue(0);
  useEffect(() => {
    swirl.value = withRepeat(withTiming(1, { duration: phase === "thinking" ? 2400 : 9000, easing: Easing.linear }), -1, false);
    breath.value = withRepeat(withSequence(withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration: 1600, easing: Easing.inOut(Easing.sin) })), -1, false);
    return () => {
      cancelAnimation(swirl);
      cancelAnimation(breath);
    };
  }, [phase, swirl, breath]);
  const core = useAnimatedStyle(() => ({ transform: [{ scale: 1 + level.value * 0.32 + breath.value * 0.04 }] }));
  const halo = useAnimatedStyle(() => ({ opacity: 0.25 + level.value * 0.5 + breath.value * 0.1, transform: [{ scale: 1.25 + level.value * 0.5 }] }));
  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${swirl.value * 360}deg` }] }));
  const colors = PALETTES[phase];
  return (
    <View style={{ width: ORB * 2.4, height: ORB * 2.4, alignItems: "center", justifyContent: "center" }}>
      <Animated.View pointerEvents="none" style={[styles.halo, { backgroundColor: colors[1], shadowColor: colors[1] }, halo]} />
      {phase !== "paused" ? [0, 1200, 2400].map((delay) => <Ripple key={delay} delay={delay} tint={colors[0]} />) : null}
      <Constellation radius={ORB * 0.95} count={12} duration={38_000} />
      <Constellation radius={ORB * 1.15} count={7} duration={60_000} reverse />
      <Animated.View style={[styles.core, { shadowColor: colors[1] }, core]}>
        <LinearGradient colors={colors} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={StyleSheet.absoluteFill} />
        <Animated.View style={[StyleSheet.absoluteFill, spin]}>
          <LinearGradient colors={["rgba(255,255,255,0.55)", "rgba(255,255,255,0)", "rgba(0,0,0,0.35)"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        </Animated.View>
        <View style={[StyleSheet.absoluteFill, { borderRadius: ORB / 2, borderWidth: 1, borderColor: "rgba(255,255,255,0.35)" }]} />
      </Animated.View>
    </View>
  );
}

export function LiveTalk({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const recorder = useAudioRecorder(RECORDING_OPTIONS);
  const recorderState = useAudioRecorderState(recorder, 90);
  const speaker = useSpeaker();
  const { pending, send, decide } = useAssistant();
  const [phase, setPhase] = useState<Phase>("paused");
  const [heard, setHeard] = useState("");
  const [said, setSaid] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const level = useSharedValue(0);
  const phaseRef = useRef<Phase>("paused");
  const alive = useRef(false);
  const vad = useRef({ started: 0, lastLoud: 0, heard: false, floor: -45 });

  function go(next: Phase) {
    phaseRef.current = next;
    setPhase(next);
  }

  async function listen() {
    if (!alive.current) return;
    try {
      speaker.stop();
      await stopRecorder();
      await beginRecording(recorder);
      vad.current = { started: Date.now(), lastLoud: 0, heard: false, floor: -45 };
      setProblem(null);
      go("listening");
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : "Microfono non disponibile");
      go("paused");
    }
  }

  async function stopRecorder() {
    if (recorder.isRecording) await recorder.stop().catch(() => undefined);
  }

  async function answer(text: string) {
    setSaid("");
    const choice = useAssistant.getState().pending.length ? voiceAnswer(text) : null;
    const turn = choice ? await decide(choice === "approve", { voice: true }) : await send(text, { voice: true });
    if (!alive.current) return;
    const reply = turn ? spokenText(turn) : useAssistant.getState().error ?? "Non ci sono riuscito, riprova.";
    const speech = turn ? turnSpeech(turn) : { text: reply };
    await speaker.speak(speech, () => {
      go("speaking");
      setSaid(reply);
      useAssistant.getState().reveal(turn?.held ?? null);
    });
    if (alive.current && phaseRef.current === "speaking") await listen();
  }

  async function finish() {
    if (phaseRef.current !== "listening") return;
    go("thinking");
    level.value = withTiming(0, { duration: 200 });
    await stopRecorder();
    const uri = recorder.uri;
    try {
      const text = uri ? await transcribeRecording(uri) : "";
      if (!alive.current) return;
      if (!text) {
        await listen();
        return;
      }
      void Haptics.selectionAsync();
      setHeard(text);
      await answer(text);
    } catch (cause) {
      if (!alive.current) return;
      setProblem(cause instanceof Error ? cause.message : "Qualcosa non ha funzionato");
      go("paused");
    }
  }

  useEffect(() => {
    if (phase !== "listening" || !recorderState.isRecording) return;
    const db = recorderState.metering ?? -160;
    const now = Date.now();
    const state = vad.current;
    state.floor = Math.min(state.floor, Math.max(db, -70));
    const loud = db > Math.max(state.floor + 14, -42);
    level.value = withTiming(Math.min(1, Math.max(0, (db - state.floor) / 35)), { duration: 90 });
    if (loud) {
      state.heard = true;
      state.lastLoud = now;
    }
    if (state.heard && now - state.lastLoud > SILENCE_MS) void finish();
    else if (!state.heard && now - state.started > IDLE_RESTART_MS) void stopRecorder().then(listen);
  }, [recorderState.metering, recorderState.isRecording, phase]);

  useEffect(() => {
    if (phase === "speaking") {
      level.value = withRepeat(withSequence(withTiming(0.55, { duration: 170 }), withTiming(0.15, { duration: 230 }), withTiming(0.4, { duration: 150 }), withTiming(0.1, { duration: 260 })), -1, false);
    } else if (phase !== "listening") {
      level.value = withTiming(0, { duration: 250 });
    }
  }, [phase, level]);

  useEffect(() => {
    if (!visible) return;
    alive.current = true;
    setHeard("");
    setSaid("");
    void listen();
    return () => {
      alive.current = false;
      speaker.stop();
      void stopRecorder();
      void setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
      phaseRef.current = "paused";
      setPhase("paused");
    };
  }, [visible]);

  function tapOrb() {
    if (phase === "speaking") {
      speaker.stop();
      go("paused");
      void listen();
    } else if (phase === "listening") {
      if (vad.current.heard) void finish();
    } else if (phase === "paused") {
      void listen();
    }
  }

  async function tapDecision(approve: boolean) {
    speaker.stop();
    await stopRecorder();
    go("thinking");
    setHeard(approve ? "Conferma" : "Annulla");
    await answer(approve ? "sì" : "no");
  }

  return (
    <Modal visible={visible} animationType="fade" presentationStyle="fullScreen" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: "#050408" }}>
        <LinearGradient colors={["#050408", "#150B24", "#2A1206"]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={StyleSheet.absoluteFill} />
        <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text variant="label" style={{ color: EMBER, letterSpacing: 3 }}>
            LIVE
          </Text>
          <Pressy onPress={onClose} accessibilityRole="button" accessibilityLabel="Chiudi live" hitSlop={12}>
            <Ionicons name="close" size={28} color="rgba(255,255,255,0.8)" />
          </Pressy>
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Pressy onPress={tapOrb} accessibilityRole="button" accessibilityLabel={LABELS[phase]} scaleTo={0.96}>
            <Orb phase={phase} level={level} />
          </Pressy>
        </View>
        <View style={{ paddingHorizontal: 28, paddingBottom: insets.bottom + 28, gap: 14, minHeight: 220 }}>
          <Text variant="label" style={{ color: EMBER, textAlign: "center", letterSpacing: 1 }}>
            {LABELS[phase]}
          </Text>
          {heard ? (
            <Text style={{ color: "rgba(255,255,255,0.55)", textAlign: "center" }} numberOfLines={2}>
              “{heard}”
            </Text>
          ) : null}
          {said ? (
            <Text variant="heading" style={{ color: "#FFF6E5", textAlign: "center" }} numberOfLines={5}>
              {said}
            </Text>
          ) : null}
          {problem ? <Text style={{ color: "#FF8A80", textAlign: "center" }}>{problem}</Text> : null}
          {pending.length && phase !== "thinking" ? (
            <View style={{ flexDirection: "row", gap: 12, justifyContent: "center" }}>
              <Pressy onPress={() => void tapDecision(false)} style={[styles.pill, { borderColor: "rgba(255,255,255,0.35)" }]}>
                <Text style={{ color: "#fff", fontWeight: "700" }}>Annulla</Text>
              </Pressy>
              <Pressy onPress={() => void tapDecision(true)} style={[styles.pill, { backgroundColor: EMBER, borderColor: EMBER }]}>
                <Text style={{ color: "#2A1206", fontWeight: "800" }}>Conferma</Text>
              </Pressy>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  ring: { position: "absolute", width: ORB, height: ORB, borderRadius: ORB / 2, borderWidth: 1.5 },
  halo: { position: "absolute", width: ORB, height: ORB, borderRadius: ORB / 2, shadowOpacity: 1, shadowRadius: 60, shadowOffset: { width: 0, height: 0 } },
  core: { width: ORB, height: ORB, borderRadius: ORB / 2, overflow: "hidden", shadowOpacity: 0.9, shadowRadius: 40, shadowOffset: { width: 0, height: 0 } },
  pill: { paddingHorizontal: 26, paddingVertical: 13, borderRadius: 999, borderWidth: 1 },
});
