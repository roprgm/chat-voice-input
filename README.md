# Chat Voice Input

Chat Voice Input adds live microphone transcription to a React composer. It writes
transcript deltas into a controlled value and includes a microphone button, waveform,
timer, and error state. Audio is never stored by the package.

The UI accepts a `Transcriber`, so transcription can run through any browser API,
service, or local model.

## Install

```bash
bun add chat-voice-input
```

React 18 or newer is required.

## Use the AI SDK transcriber

The optional AI SDK adapter streams 24 kHz PCM audio through Vercel AI Gateway:

```bash
bun add ai @ai-sdk/gateway
```

```tsx
import { useState } from "react";
import ChatVoiceInput from "chat-voice-input";
import { createAiSdkTranscriber } from "chat-voice-input/ai-sdk";
import "chat-voice-input/style.css";

const transcriber = createAiSdkTranscriber();

function Composer() {
  const [value, setValue] = useState("");

  return (
    <>
      <textarea onChange={(event) => setValue(event.target.value)} value={value} />
      <ChatVoiceInput
        disabled={false}
        onValueChange={setValue}
        transcriber={transcriber}
        value={value}
      />
    </>
  );
}
```

The adapter requests a short-lived token from `POST /api/transcription`. Add that
route to your server:

```ts
import { createTranscriptionTokenResponse } from "chat-voice-input/server";

export function POST(): Promise<Response> {
  return createTranscriptionTokenResponse({
    apiKey: process.env.AI_GATEWAY_API_KEY,
  });
}
```

Keep `AI_GATEWAY_API_KEY` on the server. When `apiKey` is omitted, AI Gateway uses
`AI_GATEWAY_API_KEY` from the environment and then Vercel OIDC.

Configure another route inside the adapter:

```ts
const transcriber = createAiSdkTranscriber({
  tokenEndpoint: "/internal/transcription-token",
});
```

## Use another transcriber

Implement the small `Transcriber` contract and pass the object to the component:

```ts
import type { Transcriber } from "chat-voice-input";

const transcriber: Transcriber = {
  async start(onDelta, signal) {
    const recording = await startYourTranscription({ onDelta, signal });

    return {
      stop: recording.stop,
      stream: recording.stream,
      text: recording.text,
    };
  },
};
```

`start` returns a stop function, an optional `MediaStream`, and a promise for the
final text. The waveform and timer appear when `stream` is present.

## Compose your own layout

```tsx
import ChatVoiceInput, { useChatVoiceInput } from "chat-voice-input";

<ChatVoiceInput.Provider
  disabled={disabled}
  onValueChange={setValue}
  transcriber={transcriber}
  value={value}
>
  <ChatVoiceInput.Error />
  <ChatVoiceInput.Waveform />
  <ChatVoiceInput.Timer />
  <ChatVoiceInput.Button />
</ChatVoiceInput.Provider>;
```

`useChatVoiceInput()` exposes `status`, `transcript`, `stream`, `start`, and `stop`.
Every component is also available as a named export.

The optional stylesheet contains only the built-in control styles and exposes
`--chat-voice-input-accent`, `--chat-voice-input-error`, and
`--chat-voice-input-muted` for theming. The component does not own its surrounding
layout.

## Development

```bash
bun install
bun run check
bun run test
bun run build
```

Run the minimal Web Speech demo with `bun run demo`. For Vercel, use
`bun run build:demo` as the build command and `demo/dist` as the output directory.

## License

[MIT](./LICENSE)
