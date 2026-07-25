# Architecture

Chat Voice Input coordinates a voice input session for a chat composer. It separates
microphone capture, transcription, and presentation so each can change without
leaking adapter-specific behavior into the others.

## Session flow

1. The provider checks local support.
2. If supported, the provider renders `loading` and requests one microphone
   `MediaStream`.
3. The provider passes that stream to the selected transcriber.
4. The UI renders `recording` only after the transcriber confirms it started.
5. Transcript deltas update the composer while capture is active.
6. Stop ends capture immediately and waits for the final transcript.
7. Completion, failure, cancellation, and unmount all release the session.

Only one session may be active. Late events from an old session are ignored.

## Ownership

### Provider

The provider owns:

- microphone permission and capture;
- the `MediaStream` and its tracks;
- session state and cancellation;
- transcript aggregation;
- cleanup on every terminal path.

It is the only layer allowed to call `getUserMedia` or stop the captured tracks.

### Transcriber

A transcriber consumes an existing stream and owns only transcription:

```ts
type TranscriberInput = {
  stream: MediaStream;
  signal: AbortSignal;
  onDelta: (delta: string) => void;
};

type Transcription = {
  stop: () => void | Promise<void>;
  text: Promise<string>;
};

type Transcriber = {
  isSupported?: () => boolean;
  start: (input: TranscriberInput) => Promise<Transcription>;
};
```

`isSupported` is an optional synchronous check. It must not perform network work.
A transcriber must not request another microphone or stop the provided stream.
Settling `text` ends the session: resolving applies the final text, while rejecting
reports a failure. Both paths release the provider's capture.

### Audio conversion

`createPcmStream` derives PCM from a `MediaStream`. It owns its `AudioContext`,
worklet, and readable stream, but not the input tracks. Closing it must never stop
the microphone.

The converter is exported from `chat-voice-input/audio` because it is useful to
custom streaming transcribers without making PCM part of the transcriber contract.
Its default output is 24 kHz signed 16-bit little-endian PCM.

### Presentation

The button, timer, waveform, and error components render provider state. They do not
capture audio or communicate with transcription services.

## Session rules

- `loading` must render before requesting microphone permission.
- `recording` means both capture and the transcriber have started.
- The UI must never imply that recording is active before that confirmation.
- Microphone denial, capture loss, and transcription failure end the session.
- An empty final transcript is valid and does not show an error.
- Stop hides recording UI immediately while final text settles.
- Emitted text is preserved if a later failure occurs.
- User-facing failures use one generic message and allow retry.
- Audio is streamed in memory and is never stored by the package.

## Adapters

The AI SDK adapter converts the provided stream with `createPcmStream`, requests a
short-lived token, and streams PCM to the transcription service. The server module
only creates that token; audio never passes through it.

The native adapter uses `SpeechRecognition` or `webkitSpeechRecognition`. It maps
browser events into the same transcriber lifecycle and treats no speech, an empty
result, and terminal events caused by Stop as successful empty completion.

## WebKit limitation

WebKit does not currently let `SpeechRecognition` consume the provider's
`MediaStream`. The provider uses the stream for visualization, and the native
adapter observes its lifecycle, while WebKit may capture audio internally for
recognition.

WebKit also chooses that capture device independently. If the provider receives a
specific microphone, the waveform and native recognition may use different
devices.

This does not satisfy the ideal single-source architecture and remains an open
design problem. Do not add another explicit `getUserMedia` call to the native
adapter as a workaround.

## Extension rules

- New transcribers consume the provided stream.
- Adapter-specific processing stays inside the adapter.
- Reusable audio transforms may become separate public modules.
- Provider state must remain independent of any transcription vendor.
- New public primitives should solve more than one adapter-specific need.

## Testing

Tests protect observable behavior and architectural ownership, not implementation
details. Prefer one happy path plus failure and cleanup scenarios such as permission
denial, timeout, microphone disconnect, interruption, and empty completion.
