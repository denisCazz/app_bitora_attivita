import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioPlayer, type AudioRecorder } from "expo-audio";
import { useCallback, useEffect, useRef, useState } from "react";
import { speechSource, type Speech } from "./assistant";

const START_TIMEOUT_MS = 6_000;

export const RECORDING_OPTIONS = { ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true };

export async function beginRecording(recorder: AudioRecorder) {
  const permission = await requestRecordingPermissionsAsync();
  if (!permission.granted) throw new Error("Serve il permesso del microfono: attivalo nelle impostazioni del telefono.");
  for (let attempt = 0; ; attempt += 1) {
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync(RECORDING_OPTIONS);
      recorder.record();
      return;
    } catch (error) {
      if (attempt >= 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }
}

export function useSpeaker() {
  const player = useAudioPlayer(null);
  const done = useRef<(() => void) | null>(null);
  const started = useRef<(() => void) | null>(null);
  const [speaking, setSpeaking] = useState(false);

  const markStarted = useCallback(() => {
    started.current?.();
    started.current = null;
  }, []);

  const finish = useCallback(() => {
    markStarted();
    setSpeaking(false);
    done.current?.();
    done.current = null;
  }, [markStarted]);

  useEffect(() => {
    const subscription = player.addListener("playbackStatusUpdate", (status) => {
      if (status.playing) markStarted();
      if (status.didJustFinish) finish();
    });
    return () => subscription.remove();
  }, [player, finish, markStarted]);

  const stop = useCallback(() => {
    if (player.playing) player.pause();
    finish();
  }, [player, finish]);

  const speak = useCallback(
    async (speech: Speech | null, onStart?: () => void) => {
      stop();
      if (!speech) {
        onStart?.();
        return;
      }
      started.current = onStart ?? null;
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
      player.replace(speechSource(speech));
      player.play();
      setSpeaking(true);
      await new Promise<void>((resolve) => {
        done.current = resolve;
        setTimeout(() => {
          if (done.current === resolve && !player.playing) finish();
        }, START_TIMEOUT_MS);
      });
    },
    [player, stop, finish],
  );

  return { speak, stop, speaking };
}
