import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from "react";

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

type Recording = Transcription | "error" | "loading" | undefined;

const ChatVoiceInputContext = createContext<ChatVoiceInputContextValue | undefined>(undefined);
const unavailableMessage = "Voice input is unavailable.";

function message(prefix: string, transcript: string): string {
  return [prefix, transcript].filter(Boolean).join(" ").trim();
}

function recordingStatus(recording: Recording): ChatVoiceInputStatus {
  if (typeof recording === "object") return "recording";
  if (recording === "loading") return "loading";
  return "idle";
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
  const controller = useRef<AbortController | undefined>(undefined);
  const prefix = useRef("");
  const transcript = useRef("");

  useEffect(
    () => () => {
      controller.current?.abort();
      controller.current = undefined;
    },
    [],
  );

  useEffect(() => {
    if (!disabled || !controller.current) return;
    const activeController = controller.current;
    controller.current = undefined;
    activeController.abort();
    setRecording(undefined);
  }, [disabled]);

  function fail(activeController: AbortController): void {
    if (controller.current !== activeController) return;
    activeController.abort();
    controller.current = undefined;
    setRecording("error");
  }

  async function start(): Promise<void> {
    if (disabled || controller.current) return;
    const activeController = new AbortController();
    controller.current = activeController;
    prefix.current = value.trim();
    transcript.current = "";
    setRecording("loading");

    try {
      const live = await transcriber.start((delta) => {
        transcript.current += delta;
        onValueChange(message(prefix.current, transcript.current));
      }, activeController.signal);
      activeController.signal.throwIfAborted();
      setRecording(live);
      void live.text.catch(() => fail(activeController));
    } catch {
      fail(activeController);
    }
  }

  async function stop(): Promise<void> {
    if (typeof recording !== "object") return;
    const live = recording;
    const activeController = controller.current;
    if (!activeController) return;
    setRecording("loading");

    try {
      live.stop();
      const finalTranscript = (await live.text).trim() || transcript.current;
      if (controller.current !== activeController) return;
      activeController.abort();
      controller.current = undefined;
      setRecording(undefined);
      onValueChange(message(prefix.current, finalTranscript));
    } catch {
      fail(activeController);
    }
  }

  const isRecording = typeof recording === "object";
  const context = {
    disabled,
    error: recording === "error" ? unavailableMessage : "",
    start,
    status: recordingStatus(recording),
    stop,
    stream: isRecording ? recording.stream : undefined,
    transcript: transcript.current,
  };
  return (
    <ChatVoiceInputContext.Provider value={context}>{children}</ChatVoiceInputContext.Provider>
  );
}
