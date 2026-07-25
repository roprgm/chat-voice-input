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
};

export type ChatVoiceInputProviderProps = {
  readonly children: ReactNode;
  readonly disabled: boolean;
  readonly onDelta?: (delta: string) => void;
  readonly transcriber?: Transcriber;
};

type Session = {
  readonly controller: AbortController;
  readonly removeTrackListeners: Array<() => void>;
  hasDelta: boolean;
  released: boolean;
  stream: MediaStream | undefined;
  transcription: Transcription | undefined;
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
  onDelta: emitDelta,
  transcriber,
}: ChatVoiceInputProviderProps) {
  const [recording, setRecording] = useState<Recording>();
  const currentSession = useRef<Session | undefined>(undefined);

  const release = useCallback((session: Session): void => {
    if (!session.released) {
      session.released = true;
      if (currentSession.current === session) currentSession.current = undefined;
      session.controller.abort();
    }
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
    if (!session.hasDelta && finalText.trim()) {
      emitDelta?.(finalText);
    }
  }

  async function start(): Promise<void> {
    if (disabled || currentSession.current) return;
    if (transcriber?.isSupported?.() === false) {
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
      hasDelta: false,
      released: false,
      removeTrackListeners: [],
      stream: undefined,
      transcription: undefined,
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

      if (!transcriber) {
        setRecording(session);
        return;
      }

      const live = await transcriber.start({
        onDelta(delta) {
          if (currentSession.current !== session) return;
          session.hasDelta = true;
          emitDelta?.(delta);
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
    const session = currentSession.current;
    if (!session) return;
    const live = session.transcription;
    if (!live) {
      complete(session, "");
      return;
    }
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
  };
  return (
    <ChatVoiceInputContext.Provider value={context}>{children}</ChatVoiceInputContext.Provider>
  );
}
