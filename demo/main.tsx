import ChatVoiceInput, { createNativeTranscriber } from "chat-voice-input";
import { createAiSdkTranscriber } from "chat-voice-input/ai-sdk";
import { type SubmitEvent, useState } from "react";
import { createRoot } from "react-dom/client";

import "chat-voice-input/style.css";
import "./styles.css";

const transcribers = {
  native: {
    name: "Native transcription",
    transcriber: createNativeTranscriber(),
  },
  "openai/gpt-realtime-whisper": {
    name: "GPT Realtime Whisper",
    transcriber: createAiSdkTranscriber({
      tokenEndpoint: `/api/transcription?model=openai/gpt-realtime-whisper`,
    }),
  },
  "xai/grok-stt": {
    name: "Grok STT",
    transcriber: createAiSdkTranscriber({
      tokenEndpoint: `/api/transcription?model=xai/grok-stt`,
    }),
  },
} as const;

type TranscriberId = keyof typeof transcribers;

function Demo() {
  const [transcriberId, setTranscriberId] = useState<TranscriberId>("openai/gpt-realtime-whisper");
  const [value, setValue] = useState("");

  function appendTranscript(delta: string): void {
    setValue((current) => [current.trimEnd(), delta.trim()].filter(Boolean).join(" "));
  }

  function onSubmit(event: SubmitEvent<HTMLFormElement>): void {
    event.preventDefault();
  }

  return (
    <>
      <select
        id="transcriber-select"
        name="transcriber"
        aria-label="Transcription method"
        className="transcriber-select"
        onChange={(event) => setTranscriberId(event.currentTarget.value as TranscriberId)}
        value={transcriberId}
      >
        {Object.entries(transcribers).map(([id, { name }]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
      <form className="composer" onSubmit={onSubmit}>
        <textarea
          aria-label="Message"
          onChange={(event) => setValue(event.target.value)}
          placeholder="Say something…"
          value={value}
        />
        <div className="actions">
          <ChatVoiceInput
            disabled={false}
            onDelta={appendTranscript}
            transcriber={transcribers[transcriberId].transcriber}
          />
          <button aria-label="Send" className="submit" type="submit">
            <svg aria-hidden="true" fill="none" height="20" viewBox="0 0 16 16" width="20">
              <path d="m4.5 7.5 3.5-3 3.5 3M8 4.5v7" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
        </div>
      </form>
    </>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Demo root is missing.");
createRoot(root).render(<Demo />);
