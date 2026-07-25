import { type FormEvent, useState } from "react";
import { createRoot } from "react-dom/client";

import ChatVoiceInput, { type Transcriber } from "../src";
import "../src/styles.css";
import "./styles.css";

type NativeSpeechRecognition = {
  continuous: boolean;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  abort: () => void;
  start: () => void;
  stop: () => void;
};

type NativeSpeechRecognitionConstructor = new () => NativeSpeechRecognition;

const browser = window as typeof window & {
  SpeechRecognition?: NativeSpeechRecognitionConstructor;
  webkitSpeechRecognition?: NativeSpeechRecognitionConstructor;
};
const BrowserSpeechRecognition = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;

const transcriber: Transcriber = {
  async start(onDelta, signal) {
    if (!BrowserSpeechRecognition) {
      throw new Error("Speech recognition is unavailable in this browser.");
    }

    const recognition = new BrowserSpeechRecognition();
    signal.throwIfAborted();

    let transcript = "";
    const abort = () => recognition.abort();
    const text = new Promise<string>((resolve, reject) => {
      recognition.onend = () => resolve(transcript);
      recognition.onerror = (event) => reject(new Error(event.error));
    }).finally(() => {
      signal.removeEventListener("abort", abort);
    });

    recognition.continuous = true;
    recognition.onresult = (event) => {
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const text = result?.[0]?.transcript.trim();
        if (!result?.isFinal || !text) continue;
        const delta = `${transcript ? " " : ""}${text}`;
        transcript += delta;
        onDelta(delta);
      }
    };
    signal.addEventListener("abort", abort, { once: true });

    recognition.start();
    return { stop: () => recognition.stop(), stream: undefined, text };
  },
};

function Demo() {
  const [value, setValue] = useState("");

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
  }

  return (
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
          onValueChange={setValue}
          transcriber={transcriber}
          value={value}
        />
        <button aria-label="Send" className="submit" type="submit">
          <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 16 16" width="16">
            <path d="m4.5 7.5 3.5-3 3.5 3M8 4.5v7" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
      </div>
    </form>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Demo root is missing.");
createRoot(root).render(<Demo />);
