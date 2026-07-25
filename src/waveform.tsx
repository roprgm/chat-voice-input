import { useEffect, useRef } from "react";

import { useChatVoiceInput } from "./provider";

const fftSize = 256;

export function ChatVoiceInputWaveform() {
  const { stream } = useChatVoiceInput();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const drawing = canvas?.getContext("2d");
    if (!stream || !canvas || !drawing) return;

    const element = canvas;
    const context = drawing;
    const audio = new AudioContext();
    const analyser = audio.createAnalyser();
    analyser.fftSize = fftSize;
    const source = audio.createMediaStreamSource(stream);
    const samples = new Float32Array(analyser.fftSize);
    const levels: number[] = [];
    const color = getComputedStyle(element).color;
    let frame = 0;

    source.connect(analyser);
    void audio.resume().catch(() => undefined);

    function draw(): void {
      const ratio = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(element.clientWidth * ratio));
      const height = Math.max(1, Math.round(element.clientHeight * ratio));
      if (element.width !== width || element.height !== height) {
        element.width = width;
        element.height = height;
      }

      analyser.getFloatTimeDomainData(samples);
      let level = 0;
      for (const sample of samples) level = Math.max(level, Math.abs(sample));

      const columns = Math.ceil(width / ratio);
      levels.push(level);
      levels.splice(0, Math.max(0, levels.length - columns));
      context.clearRect(0, 0, width, height);
      context.fillStyle = color;
      for (let index = 0; index < levels.length; index += 1) {
        const barHeight = Math.max(1, (levels[index] ?? 0) * height * 0.9);
        context.fillRect(
          (columns - levels.length + index) * ratio,
          (height - barHeight) / 2,
          ratio,
          barHeight,
        );
      }
      frame = requestAnimationFrame(draw);
    }

    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      source.disconnect();
      void audio.close();
    };
  }, [stream]);

  if (!stream) return null;
  return (
    <canvas
      aria-label="Live audio waveform"
      className="chat-voice-input-waveform"
      ref={canvasRef}
      role="img"
    />
  );
}
