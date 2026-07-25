# Chat Voice Input

Chat Voice Input adds live microphone transcription to a React composer. It writes
transcript deltas into a controlled value and includes a microphone button, waveform,
timer, and error state. Audio is never stored by the package.

The UI accepts a `Transcriber` and includes adapters for AI SDK transcription and
the browser's native speech recognition. You can also connect any service or local
model with the same small interface.

<p align="center">
  <a href="https://chat-voice-input.vercel.app">Live demo</a>
</p>

<p align="center">
  <img
    src="https://github.com/user-attachments/assets/f80e1900-1009-4e7e-8f88-e5243aeb3c75"
    alt="Chat Voice Input recording interface"
    width="640"
  />
</p>

## Features

- Live transcript deltas in any controlled value
- Native browser and AI SDK transcribers
- Composable button, waveform, timer, and error
- Loading, recording, stopping, and retry states
- Custom transcriber interface
- Audio is never stored

## Install

```bash
pnpm add chat-voice-input
```

React 18 or newer is required.

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
`--chat-voice-input-button-background`,
`--chat-voice-input-button-background-hover`, and `--chat-voice-input-muted` for
theming. The component does not own its surrounding layout.

## Use the AI SDK transcriber (recommended)

The optional [AI SDK](https://ai-sdk.dev) adapter streams 24 kHz PCM audio through
Vercel AI Gateway:

```bash
pnpm add ai @ai-sdk/gateway
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

Keep `AI_GATEWAY_API_KEY` on the server. Pass `model` to use another compatible
realtime transcription model.

The adapter opens the microphone and requests the token in parallel so recording
starts as soon as the browser grants access. PCM audio captured while the token is
pending stays in the stream and is consumed once transcription connects. If the token
request fails or times out, the microphone is closed and the component shows its error
state.

### Protect the token route

The route mints a token that is spent against your Gateway account, and it has no
authentication of its own. Anyone who finds the URL on a deployed app can transcribe
on your bill, so gate it before shipping:

- Require an authenticated session and reject anonymous requests.
- Rate limit per user, and per IP for anything reachable without a session.
- Serve it over HTTPS only, and never log the token.

```ts
import { createTranscriptionTokenResponse } from "chat-voice-input/server";

export async function POST(request: Request): Promise<Response> {
  const session = await auth(request);
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (await isRateLimited(session.userId)) {
    return new Response("Too Many Requests", { status: 429 });
  }

  return createTranscriptionTokenResponse({
    apiKey: process.env.AI_GATEWAY_API_KEY,
  });
}
```

Tokens are short-lived and the response is sent with `Cache-Control: no-store`, so a
leaked token expires on its own — but the route itself stays open until you close it.

Configure another route inside the adapter:

```ts
const transcriber = createAiSdkTranscriber({
  tokenEndpoint: "/internal/transcription-token",
});
```

## Use the native browser transcriber

For a setup without a backend, API key, or additional dependency, use the browser's
built-in speech recognition:

```tsx
import ChatVoiceInput, { createNativeTranscriber } from "chat-voice-input";

const transcriber = createNativeTranscriber();
```

Pass it to `ChatVoiceInput` exactly like the AI SDK adapter. You can optionally set
the recognition language; otherwise it uses `navigator.language`:

```ts
const transcriber = createNativeTranscriber({ language: "es-ES" });
```

This adapter uses `SpeechRecognition` or `webkitSpeechRecognition`, so availability
and transcription quality depend on the browser. It opens a microphone stream for
the waveform and closes it when transcription stops, aborts, or finishes.

## Use a custom transcriber

Implement the small `Transcriber` contract and pass the object to the component:

```ts
import type { Transcriber } from "chat-voice-input";

const transcriber: Transcriber = {
  async start(onDelta, signal) {
    const recording = await startYourTranscription({ onDelta, signal });

    return {
      captureEnded: recording.captureEnded,
      stop: recording.stop,
      stream: recording.stream,
      text: recording.text,
    };
  },
};
```

`start` returns a stop function, an optional `MediaStream`, and a promise for the
final text. It can also return an optional `captureEnded` promise so recording UI
stops while final text is still being processed. The waveform and timer appear when
`stream` is present.

## Covered edge cases

Failures show `Voice input is unavailable.` and change the microphone button to Retry.
Adapters do not fall back to each other automatically.

### Shared behavior

| Case | Behavior |
| --- | --- |
| Disabled | Does not start |
| Microphone permission pending | Shows loading; no waveform or timer |
| Capture active | Shows waveform, timer, and Stop |
| User stops | Closes capture and shows loading until final text |
| Empty or no-speech result | Returns to idle; no error or value change |
| Start or transcription failure | Closes capture and shows the retryable error |
| Disabled or unmounted while active | Aborts and closes capture |

### Native browser transcriber

| Case | Behavior |
| --- | --- |
| `SpeechRecognition` unavailable | Does not request the microphone; shows the error |
| Microphone unavailable or denied | Does not start recognition; shows the error |
| Microphone granted | Starts recognition; stays loading until `audiostart` |
| `audioend` before final text | Hides recording UI; shows loading |
| Microphone disconnected before text | Aborts recognition; shows the error |
| Error after valid text | Keeps the text; returns to idle without an error |
| Recognition ends without text | Returns to idle without an error |

### AI SDK transcriber

| Case | Behavior |
| --- | --- |
| User starts | Requests microphone and token in parallel |
| Token pending; microphone ready | Starts capture; queues audio until the token arrives |
| Token request fails or times out | Closes capture; shows the error |
| Transcription stream fails | Keeps emitted text; closes capture; shows the error |
| No transcript generated | Returns to idle without an error |

## Development

```bash
pnpm install
pnpm check
pnpm test
pnpm build
```

Run the native browser transcriber demo with `pnpm demo`.

## License

[MIT](./LICENSE)
