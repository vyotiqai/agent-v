import { useCallback, useEffect, useRef, useState } from "react";
import { upload } from "./api";

export type DictationState = "idle" | "listening" | "transcribing";

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type Recognition = new () => SpeechRecognitionLike;
const browserRecognition = (): Recognition | undefined =>
  (
    globalThis as unknown as {
      SpeechRecognition?: Recognition;
      webkitSpeechRecognition?: Recognition;
    }
  ).SpeechRecognition ??
  (globalThis as unknown as { webkitSpeechRecognition?: Recognition }).webkitSpeechRecognition;

const mimeType = () =>
  ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find(
    (t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t),
  );

/**
 * In the browser: record with MediaRecorder and transcribe on the server, or, when the server
 * has no transcription model, use the browser's own speech recognition where it exists.
 */
export function useDictation(options: {
  serverTranscription: boolean;
  onText: (text: string) => void;
  onError: (message: string) => void;
}) {
  const [state, setState] = useState<DictationState>("idle");
  const [level, setLevel] = useState(0);
  const handlers = useRef(options);
  handlers.current = options;
  const session = useRef<{ stop: () => void; cancel: () => void } | null>(null);
  const useServer = options.serverTranscription && typeof MediaRecorder !== "undefined";
  const available = useServer || Boolean(browserRecognition());

  useEffect(() => () => session.current?.cancel(), []);

  const startRecorder = useCallback(async (autoStop: boolean) => {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return handlers.current.onError("Allow the microphone to talk");
    }
    const type = mimeType();
    const recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const chunks: Blob[] = [];
    let cancelled = false;
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    // Level meter and silence detection for hands-free mode.
    const audio = new AudioContext();
    const analyser = audio.createAnalyser();
    analyser.fftSize = 512;
    audio.createMediaStreamSource(stream).connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    let heard = false;
    let quietSince: number | null = null;
    const timer = setInterval(() => {
      analyser.getFloatTimeDomainData(samples);
      const rms = Math.sqrt(samples.reduce((s, v) => s + v * v, 0) / samples.length);
      setLevel(Math.min(1, rms * 8));
      if (!autoStop) return;
      if (rms > 0.02) {
        heard = true;
        quietSince = null;
      } else if (heard) {
        quietSince ??= Date.now();
        if (Date.now() - quietSince > 1300) stop();
      }
    }, 100);
    const cleanup = () => {
      clearInterval(timer);
      for (const track of stream.getTracks()) track.stop();
      void audio.close();
      setLevel(0);
    };
    recorder.onstop = async () => {
      cleanup();
      if (cancelled) return setState("idle");
      setState("transcribing");
      try {
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        const name = blob.type.includes("mp4") ? "voice.m4a" : "voice.webm";
        const { text } = await upload<{ text: string }>(
          "/api/voice/transcribe",
          new File([blob], name, { type: blob.type.split(";")[0] }),
          name,
        );
        if (text) handlers.current.onText(text);
      } catch (e) {
        handlers.current.onError((e as Error).message);
      } finally {
        setState("idle");
      }
    };
    function stop() {
      if (recorder.state !== "inactive") recorder.stop();
    }
    session.current = {
      stop,
      cancel: () => {
        cancelled = true;
        stop();
      },
    };
    recorder.start(250);
    setState("listening");
  }, []);

  const startRecognition = useCallback(() => {
    const Recognition = browserRecognition();
    if (!Recognition)
      return handlers.current.onError("Voice input is not available in this browser");
    const recognition = new Recognition();
    recognition.lang = navigator.language || "en-US";
    recognition.interimResults = false;
    recognition.continuous = false;
    let text = "";
    let cancelled = false;
    recognition.onresult = (event) => {
      text = Array.from(event.results)
        .map((r) => r[0]?.transcript ?? "")
        .join(" ")
        .trim();
    };
    recognition.onerror = (event) => {
      if (event.error !== "aborted" && event.error !== "no-speech")
        handlers.current.onError(`Voice input failed (${event.error})`);
    };
    recognition.onend = () => {
      setState("idle");
      if (!cancelled && text) handlers.current.onText(text);
    };
    session.current = {
      stop: () => recognition.stop(),
      cancel: () => {
        cancelled = true;
        recognition.abort();
      },
    };
    recognition.start();
    setState("listening");
  }, []);

  const start = useCallback(
    async (opts: { autoStop?: boolean } = {}) => {
      if (useServer) await startRecorder(Boolean(opts.autoStop));
      else startRecognition();
    },
    [useServer, startRecorder, startRecognition],
  );

  return {
    state,
    level,
    available,
    start,
    stop: async () => session.current?.stop(),
    cancel: async () => {
      session.current?.cancel();
      setState("idle");
    },
  };
}
