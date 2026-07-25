import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";

import type { Transcriber, Transcription } from "./transcribers/types";

export type ChatVoiceInputStatus = "idle" | "loading" | "recording";

type ChatVoiceInputContextValue = {
  readonly disabled: boolean;
  readonly error: string;
  readonly start: () => Promise<void>;
  readonly status: ChatVoiceInputStatus;
  readonly stop: () => Promise<void>;
  readonly stream: MediaStream | undefined;
  readonly transcript: string;
};

export type ChatVoiceInputProviderProps = {
  readonly children: ReactNode;
  readonly disabled: boolean;
  readonly onValueChange: (value: string) => void;
  readonly transcriber: Transcriber;
  readonly value: string;
};

type Session = {
  readonly controller: AbortController;
  readonly prefix: string;
  readonly removeTrackListeners: Array<() => void>;
  released: boolean;
  stream: MediaStream | undefined;
  transcription: Transcription | undefined;
  transcript: string;
};

type Recording = Session | "error" | "loading" | undefined;

const ChatVoiceInputContext = createContext<ChatVoiceInputContextValue | undefined>(undefined);
const unavailableMessage = "Voice input is unavailable.";
const microphoneConstraints: MediaStreamConstraints = {
  audio: {
    autoGainControl: true,
    channelCount: 1,
    echoCancellation: true,
    noiseSuppression: true,
  },
};

function message(prefix: string, transcript: string): string {
  return [prefix, transcript].filter(Boolean).join(" ").trim();
}

function recordingStatus(recording: Recording): ChatVoiceInputStatus {
  if (typeof recording === "object") return "recording";
  if (recording === "loading") return "loading";
  return "idle";
}

function stopCapture(session: Session): void {
  for (const removeListener of session.removeTrackListeners.splice(0)) {
    removeListener();
  }
  for (const track of session.stream?.getTracks() ?? []) {
    track.stop();
  }
  session.stream = undefined;
}

export function useChatVoiceInput(): ChatVoiceInputContextValue {
  const context = useContext(ChatVoiceInputContext);
  if (!context) throw new Error("useChatVoiceInput must be used within ChatVoiceInputProvider.");
  return context;
}

export function ChatVoiceInputProvider({
  children,
  disabled,
  onValueChange,
  transcriber,
  value,
}: ChatVoiceInputProviderProps) {
  const [recording, setRecording] = useState<Recording>();
  const currentSession = useRef<Session | undefined>(undefined);

  const release = useCallback((session: Session): void => {
    if (session.released) return;
    session.released = true;
    if (currentSession.current === session) currentSession.current = undefined;
    session.controller.abort();
    stopCapture(session);
  }, []);

  useEffect(() => {
    if (!disabled || !currentSession.current) return;
    release(currentSession.current);
    setRecording(undefined);
  }, [disabled, release]);

  useEffect(
    () => () => {
      if (currentSession.current) release(currentSession.current);
    },
    [release],
  );

  function fail(session: Session): void {
    const isCurrent = currentSession.current === session;
    release(session);
    if (!isCurrent) return;
    setRecording("error");
  }

  function complete(session: Session, finalText: string): void {
    if (currentSession.current !== session) return;
    release(session);
    setRecording(undefined);
    const finalTranscript = finalText.trim() || session.transcript;
    if (finalTranscript) {
      onValueChange(message(session.prefix, finalTranscript));
    }
  }

  async function start(): Promise<void> {
    if (disabled || currentSession.current) return;
    if (transcriber.isSupported?.() === false) {
      setRecording("error");
      return;
    }

    const mediaDevices = globalThis.navigator?.mediaDevices;
    if (!mediaDevices) {
      setRecording("error");
      return;
    }

    const session: Session = {
      controller: new AbortController(),
      prefix: value.trim(),
      released: false,
      removeTrackListeners: [],
      stream: undefined,
      transcription: undefined,
      transcript: "",
    };
    currentSession.current = session;
    flushSync(() => setRecording("loading"));

    try {
      session.stream = await mediaDevices.getUserMedia(microphoneConstraints);
      session.controller.signal.throwIfAborted();

      for (const track of session.stream.getTracks()) {
        const onEnded = () => fail(session);
        track.addEventListener("ended", onEnded, { once: true });
        session.removeTrackListeners.push(() => track.removeEventListener("ended", onEnded));
      }

      const live = await transcriber.start({
        onDelta(delta) {
          if (currentSession.current !== session) return;
          session.transcript += delta;
          onValueChange(message(session.prefix, session.transcript));
        },
        signal: session.controller.signal,
        stream: session.stream,
      });
      session.controller.signal.throwIfAborted();
      session.transcription = live;
      setRecording(session);
      void live.text.then(
        (finalText) => complete(session, finalText),
        () => fail(session),
      );
    } catch {
      fail(session);
    }
  }

  async function stop(): Promise<void> {
    if (typeof recording !== "object") return;
    const session = recording;
    const live = session.transcription;
    if (!live || currentSession.current !== session) return;
    setRecording("loading");

    try {
      const stopped = live.stop();
      stopCapture(session);
      await stopped;
    } catch {
      fail(session);
      return;
    }
    await live.text.catch(() => undefined);
  }

  const isRecording = typeof recording === "object";
  const context = {
    disabled,
    error: recording === "error" ? unavailableMessage : "",
    start,
    status: recordingStatus(recording),
    stop,
    stream: isRecording ? recording.stream : undefined,
    transcript: isRecording ? recording.transcript : "",
  };
  return (
    <ChatVoiceInputContext.Provider value={context}>{children}</ChatVoiceInputContext.Provider>
  );
}
