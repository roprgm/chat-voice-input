import { useEffect, useRef } from "react";

import { MicIcon, SpinnerIcon, StopIcon } from "./icons";
import { type ChatVoiceInputStatus, useChatVoiceInput } from "./provider";

function buttonLabel(state: ChatVoiceInputStatus, error: string): string {
  if (state === "recording") return "Stop voice input";
  if (state === "loading") return "Loading voice input";
  if (error) return "Retry voice input";
  return "Start voice input";
}

function ButtonIcon({ state }: { readonly state: ChatVoiceInputStatus }) {
  if (state === "loading") return <SpinnerIcon className="chat-voice-input-spinner" />;
  if (state === "recording") return <StopIcon className="chat-voice-input-stop-icon" />;
  return <MicIcon />;
}

export function ChatVoiceInputError() {
  const { error } = useChatVoiceInput();
  if (!error) return null;
  return (
    <span className="chat-voice-input-error" role="alert">
      {error}
    </span>
  );
}

export function ChatVoiceInputButton() {
  const { disabled, error, start, status, stop } = useChatVoiceInput();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const isLoading = status === "loading";
  const className =
    status === "recording"
      ? "chat-voice-input-button chat-voice-input-button-recording"
      : "chat-voice-input-button";
  const label = buttonLabel(status, error);
  const title = error || undefined;
  const buttonDisabled = disabled || isLoading;

  useEffect(() => {
    const form = buttonRef.current?.form;
    if (!form) return;

    function onSubmit(): void {
      void stop();
    }

    form.addEventListener("submit", onSubmit);
    return () => form.removeEventListener("submit", onSubmit);
  }, [stop]);

  function onClick(): void {
    if (status === "recording") {
      void stop();
      return;
    }
    void start();
  }

  return (
    <button
      aria-busy={isLoading}
      aria-label={label}
      className={className}
      disabled={buttonDisabled}
      onClick={onClick}
      ref={buttonRef}
      title={title}
      type="button"
    >
      <ButtonIcon state={status} />
    </button>
  );
}
