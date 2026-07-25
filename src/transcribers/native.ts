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
  let transcript = "";
  const abort = () => {
    try {
      recognition.abort();
    } finally {
      stopStream();
    }
  };
  const text = new Promise<string>((resolve, reject) => {
    recognition.onend = () => resolve(transcript);
    recognition.onerror = (event) => reject(new Error(event.error));
  }).finally(() => {
    signal.removeEventListener("abort", abort);
    stopStream();
    recognition.onend = null;
    recognition.onerror = null;
    recognition.onresult = null;
  });

  recognition.continuous = true;
  const recognitionLanguage = language ?? globalThis.navigator.language;
  if (recognitionLanguage) {
    recognition.lang = recognitionLanguage;
  }
  recognition.onresult = (event) => {
    transcript = appendFinalResults(event, transcript, onDelta);
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    recognition.start();
  } catch (error) {
    signal.removeEventListener("abort", abort);
    stopStream();
    recognition.onend = null;
    recognition.onerror = null;
    recognition.onresult = null;
    throw error;
  }

  const stop = () => {
    try {
      recognition.stop();
    } finally {
      stopStream();
    }
  };
  return { stop, stream, text };
}

export function createNativeTranscriber(options?: NativeTranscriberOptions): Transcriber {
  const language = options?.language;
  return {
    start: (onDelta, signal) => startNativeTranscription(onDelta, signal, language),
  };
}
