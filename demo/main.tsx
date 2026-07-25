import { type SubmitEvent, useState } from "react";
import { createRoot } from "react-dom/client";

import ChatVoiceInput, { createNativeTranscriber } from "../src";
import "../src/styles.css";
import "./styles.css";

const transcriber = createNativeTranscriber();

function Demo() {
  const [value, setValue] = useState("");

  function onSubmit(event: SubmitEvent<HTMLFormElement>): void {
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
          capture={false} // TEMPORARY EXPERIMENT: transcription only. DO NOT MERGE.
          disabled={false}
          onValueChange={setValue}
          transcriber={transcriber}
          value={value}
        />
        <button aria-label="Send" className="submit" type="submit">
          <svg aria-hidden="true" fill="none" height="20" viewBox="0 0 16 16" width="20">
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
