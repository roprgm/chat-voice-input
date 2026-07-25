# Chat Voice Input

A composable voice input for chat composers, with a microphone button, live waveform,
timer, and built-in loading, recording, and error states.

Use the AI SDK adapter, native browser speech recognition, or connect any service or
local model through the `Transcriber` interface. The component coordinates capture,
stopping, empty results, failures, and cleanup. Audio is never stored by the package.

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

## Install

```bash
pnpm add chat-voice-input
```

React 18 or newer is required.

## Use the AI SDK transcriber

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

The provider requests the microphone immediately. The adapter starts capturing PCM
and requests its token as soon as the stream is available. Audio captured while the
token is pending is consumed when transcription connects.

Keep `AI_GATEWAY_API_KEY` on the server. Protect the token route with authentication
and rate limiting because it spends against your Gateway account. Use
`tokenEndpoint` to configure another route.

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
and transcription quality depend on the browser. On WebKit, speech recognition
controls its own audio capture because the browser API cannot consume a provided
`MediaStream`.

## Use a custom transcriber

Implement the small `Transcriber` contract and pass the object to the component:

```ts
import type { Transcriber } from "chat-voice-input";

const transcriber: Transcriber = {
  async start({ stream, onDelta, signal }) {
    const recording = await startYourTranscription({ stream, onDelta, signal });

    return {
      stop: recording.stop,
      text: recording.text,
    };
  },
};
```

The provider opens and closes the microphone. The transcriber receives that stream
with an abort signal and a callback for text deltas. It returns a stop function and
a promise for the final text.

If your service needs PCM, use the same converter as the AI SDK adapter:

```ts
import { createPcmStream } from "chat-voice-input/audio";

const pcm = await createPcmStream(stream); // 24 kHz s16le by default
```

Pass `{ sampleRate }` to select another rate. Closing the PCM stream releases only
its audio graph; microphone ownership stays with the provider.

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

## Covered edge cases

`ChatVoiceInputProvider` handles every `Transcriber` through the same lifecycle.
Adapters report microphone and transcription failures through that contract. Any
failure shows `Voice input is unavailable.` and changes the button to Retry.

| Scenario | Behavior |
| --- | --- |
| Voice input is disabled | Disables Start; does not call the transcriber |
| Waiting for microphone permission or transcriber start | Shows Loading; disables the button; shows no recording UI |
| Capture and transcription are active | Shows Stop, waveform, and timer |
| User denies microphone permission | Rejects the start; shows the error and Retry |
| Native transcriber is selected but unavailable | Rejects before requesting the microphone; shows the error and Retry |
| Microphone is unavailable or busy | Rejects the start; shows the error and Retry |
| Transcriber emits text | Updates the value immediately |
| User presses Stop | Stops capture; shows Loading until final text settles |
| Transcriber finishes on its own | Stops capture, applies final text, and returns to idle |
| Transcriber ends without text | Keeps the current value; returns to idle without an error |
| Remote transcriber is still connecting | Captures audio; shows recording only after the adapter confirms it started |
| Transcriber fails during recording | Aborts capture; keeps emitted text; shows the error and Retry |
| Microphone disconnects during recording | Aborts transcription; keeps emitted text; shows the error and Retry |
| Voice input is disabled or unmounted while active | Aborts capture and ignores late results |

## Development

```bash
pnpm install
pnpm check
pnpm test
pnpm build
```

Run the demo with `pnpm demo`. Its selector switches between native browser
transcription and the streaming AI SDK models available through AI Gateway.

## License

[MIT](./LICENSE)
