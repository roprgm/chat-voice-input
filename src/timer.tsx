import { useEffect, useRef } from "react";

import { useChatVoiceInput } from "./provider";

function formatElapsedTime(elapsedSeconds: number): string {
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = String(elapsedSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function ChatVoiceInputTimer() {
  const { stream } = useChatVoiceInput();
  const timeRef = useRef<HTMLTimeElement>(null);

  useEffect(() => {
    const time = timeRef.current;
    if (!stream || !time) return;
    const clock = time;
    const startedAt = performance.now();

    function update(): void {
      const elapsed = Math.floor((performance.now() - startedAt) / 1_000);
      clock.dateTime = `PT${elapsed}S`;
      clock.textContent = formatElapsedTime(elapsed);
    }

    update();
    const interval = window.setInterval(update, 250);
    return () => window.clearInterval(interval);
  }, [stream]);

  if (!stream) return null;
  return (
    <time className="chat-voice-input-timer" dateTime="PT0S" ref={timeRef}>
      0:00
    </time>
  );
}
