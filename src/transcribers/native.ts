import type { Transcriber, Transcription } from "./types";

type SpeechRecognitionAlternative = {
  readonly transcript: string;
};

type SpeechRecognitionResult = {
  readonly [index: number]: SpeechRecognitionAlternative | undefined;
  readonly isFinal: boolean;
};

type SpeechRecognitionEvent = {
  readonly resultIndex: number;
  readonly results: {
    readonly [index: number]: SpeechRecognitionResult | undefined;
    readonly length: number;
  };
};

type SpeechRecognitionErrorEvent = {
  readonly error: string;
};

type NativeSpeechRecognition = {
  continuous: boolean;
  lang: string;
  onaudioend: (() => void) | null;
  onaudiostart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  abort: () => void;
  start: () => void;
  stop: () => void;
};

type NativeSpeechRecognitionConstructor = new () => NativeSpeechRecognition;

type SpeechRecognitionGlobal = typeof globalThis & {
  SpeechRecognition?: NativeSpeechRecognitionConstructor;
  webkitSpeechRecognition?: NativeSpeechRecognitionConstructor;
};

export type NativeTranscriberOptions = {
  readonly language?: string;
};

function speechRecognitionConstructor(): NativeSpeechRecognitionConstructor | undefined {
  const browser = globalThis as SpeechRecognitionGlobal;
  return browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
}

function stopMediaStream(stream: MediaStream): void {
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

async function createWaveformStream(signal: AbortSignal): Promise<MediaStream> {
  const mediaDevices = globalThis.navigator?.mediaDevices;
  if (!mediaDevices) {
    throw new Error("Microphone access is unavailable in this browser.");
  }
  const stream = await mediaDevices.getUserMedia({ audio: true });
  if (signal.aborted) {
    stopMediaStream(stream);
    signal.throwIfAborted();
  }
  return stream;
}

function streamStopper(stream: MediaStream): () => void {
  let isStopped = false;
  return () => {
    if (isStopped) {
      return;
    }
    isStopped = true;
    stopMediaStream(stream);
  };
}

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly reject: (reason: unknown) => void;
  readonly resolve: (value: T) => void;
} {
  let reject!: (reason: unknown) => void;
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, reject, resolve };
}

function appendFinalResults(
  event: SpeechRecognitionEvent,
  transcript: string,
  onDelta: (delta: string) => void,
): string {
  let nextTranscript = transcript;
  for (let index = event.resultIndex; index < event.results.length; index += 1) {
    const result = event.results[index];
    const text = result?.[0]?.transcript.trim();
    if (!result?.isFinal || !text) {
      continue;
    }
    const delta = `${nextTranscript ? " " : ""}${text}`;
    nextTranscript += delta;
    onDelta(delta);
  }
  return nextTranscript;
}

async function startNativeTranscription(
  onDelta: (delta: string) => void,
  signal: AbortSignal,
  language: string | undefined,
): Promise<Transcription> {
  const SpeechRecognition = speechRecognitionConstructor();
  if (!SpeechRecognition) {
    throw new Error("Speech recognition is unavailable in this browser.");
  }
  signal.throwIfAborted();

  const recognition = new SpeechRecognition();
  const stream = await createWaveformStream(signal);
  const stopStream = streamStopper(stream);
  const tracks = stream.getTracks();
  const started = deferred<void>();
  const captureEnded = deferred<void>();
  const result = deferred<string>();
  void started.promise.catch(() => undefined);
  let transcript = "";
  let isCancelled = false;

  function succeed(): void {
    started.resolve();
    captureEnded.resolve();
    result.resolve(transcript);
  }

  function fail(error: Error): void {
    started.reject(error);
    captureEnded.resolve();
    result.reject(error);
  }

  const microphoneEnded = () => {
    const error = new Error("audio-capture");
    if (transcript) {
      succeed();
    } else {
      fail(error);
    }
    try {
      recognition.abort();
    } finally {
      stopStream();
    }
  };
  const abort = () => {
    isCancelled = true;
    try {
      recognition.abort();
    } finally {
      succeed();
      stopStream();
    }
  };
  let isCleanedUp = false;
  const cleanup = () => {
    if (isCleanedUp) return;
    isCleanedUp = true;
    signal.removeEventListener("abort", abort);
    for (const track of tracks) {
      track.removeEventListener("ended", microphoneEnded);
    }
    stopStream();
    recognition.onaudioend = null;
    recognition.onaudiostart = null;
    recognition.onend = null;
    recognition.onerror = null;
    recognition.onresult = null;
  };
  const text = result.promise.finally(cleanup);
  void text.catch(() => undefined);

  recognition.continuous = true;
  const recognitionLanguage = language ?? globalThis.navigator.language;
  if (recognitionLanguage) {
    recognition.lang = recognitionLanguage;
  }
  recognition.onresult = (event) => {
    transcript = appendFinalResults(event, transcript, onDelta);
  };
  recognition.onaudiostart = () => started.resolve();
  recognition.onaudioend = () => captureEnded.resolve();
  recognition.onend = succeed;
  recognition.onerror = (event) => {
    if (event.error === "no-speech" || (event.error === "aborted" && isCancelled) || transcript) {
      succeed();
      return;
    }
    fail(new Error(event.error));
  };
  for (const track of tracks) {
    track.addEventListener("ended", microphoneEnded, { once: true });
  }
  signal.addEventListener("abort", abort, { once: true });
  try {
    recognition.start();
  } catch (error) {
    fail(error instanceof Error ? error : new Error(String(error)));
    throw error;
  }
  await started.promise;
  signal.throwIfAborted();

  const stop = () => {
    captureEnded.resolve();
    try {
      recognition.stop();
    } finally {
      stopStream();
    }
  };
  return { captureEnded: captureEnded.promise, stop, stream, text };
}

export function createNativeTranscriber(options?: NativeTranscriberOptions): Transcriber {
  const language = options?.language;
  return {
    start: (onDelta, signal) => startNativeTranscription(onDelta, signal, language),
  };
}
