import type { Transcriber, TranscriberInput, Transcription } from "./types";

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
  { onDelta, signal, stream }: TranscriberInput,
  language: string | undefined,
): Promise<Transcription> {
  const SpeechRecognition = speechRecognitionConstructor();
  if (!SpeechRecognition) {
    throw new Error("Speech recognition is unavailable in this browser.");
  }
  signal.throwIfAborted();

  const recognition = new SpeechRecognition();
  const tracks = stream.getTracks();
  const started = deferred<void>();
  const result = deferred<string>();
  void started.promise.catch(() => undefined);
  let transcript = "";
  let isCancelled = false;
  let isStopping = false;
  let terminalError: Error | undefined;

  function succeed(): void {
    started.resolve();
    result.resolve(transcript);
  }

  function fail(error: Error): void {
    started.reject(error);
    result.reject(error);
  }

  function finish(): void {
    if (terminalError) {
      fail(terminalError);
      return;
    }
    succeed();
  }

  const microphoneEnded = () => {
    if (!isStopping && !transcript) terminalError = new Error("audio-capture");
    if (!isStopping) recognition.abort();
  };
  const abort = () => {
    isCancelled = true;
    recognition.abort();
  };
  let isCleanedUp = false;
  const cleanup = () => {
    if (isCleanedUp) return;
    isCleanedUp = true;
    signal.removeEventListener("abort", abort);
    for (const track of tracks) {
      track.removeEventListener("ended", microphoneEnded);
    }
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
  recognition.onend = finish;
  recognition.onerror = (event) => {
    const endedByCaller =
      (event.error === "aborted" || event.error === "audio-capture") && (isCancelled || isStopping);
    if (event.error !== "no-speech" && !endedByCaller && !transcript)
      terminalError = new Error(event.error);
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
    isStopping = true;
    recognition.stop();
  };
  return { stop, text };
}

export function createNativeTranscriber(options?: NativeTranscriberOptions): Transcriber {
  const language = options?.language;
  return {
    isSupported: () => Boolean(speechRecognitionConstructor()),
    start: (input) => startNativeTranscription(input, language),
  };
}
