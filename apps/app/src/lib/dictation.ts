import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { useCallback, useEffect, useRef, useState } from "react";
import { upload } from "./api";

export type DictationState = "idle" | "listening" | "transcribing";

/**
 * Record on the device and transcribe on the server. With `autoStop`, recording ends after a
 * short silence once speech has started (for hands-free voice mode).
 */
export function useDictation(options: {
  serverTranscription: boolean;
  onText: (text: string) => void;
  onError: (message: string) => void;
}) {
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const status = useAudioRecorderState(recorder, 120);
  const [state, setState] = useState<DictationState>("idle");
  const autoStop = useRef(false);
  const heard = useRef(false);
  const quietSince = useRef<number | null>(null);
  const handlers = useRef(options);
  handlers.current = options;

  const finish = useCallback(async () => {
    if (!recorder.isRecording) return;
    setState("transcribing");
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false });
      const uri = recorder.uri;
      if (!uri) throw new Error("Nothing was recorded");
      const { text } = await upload<{ text: string }>(
        "/api/voice/transcribe",
        { uri, name: "voice.m4a", type: "audio/mp4" },
        "voice.m4a",
      );
      if (text) handlers.current.onText(text);
    } catch (e) {
      handlers.current.onError((e as Error).message);
    } finally {
      setState("idle");
    }
  }, [recorder]);

  const start = useCallback(
    async (opts: { autoStop?: boolean } = {}) => {
      if (!handlers.current.serverTranscription)
        return handlers.current.onError("Voice input needs a transcription model on the server");
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) return handlers.current.onError("Allow the microphone to talk");
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      autoStop.current = Boolean(opts.autoStop);
      heard.current = false;
      quietSince.current = null;
      recorder.record();
      setState("listening");
    },
    [recorder],
  );

  // Metering is in dBFS: louder than -40 counts as speech.
  const level =
    status.metering === undefined ? 0 : Math.max(0, Math.min(1, (status.metering + 60) / 60));
  useEffect(() => {
    if (state !== "listening" || !autoStop.current || status.metering === undefined) return;
    const now = Date.now();
    if (status.metering > -40) {
      heard.current = true;
      quietSince.current = null;
    } else if (heard.current) {
      quietSince.current ??= now;
      if (now - quietSince.current > 1300) void finish();
    }
  }, [status.metering, state, finish]);

  const cancel = useCallback(async () => {
    if (recorder.isRecording) await recorder.stop().catch(() => {});
    setState("idle");
  }, [recorder]);

  return { state, level, available: options.serverTranscription, start, stop: finish, cancel };
}
