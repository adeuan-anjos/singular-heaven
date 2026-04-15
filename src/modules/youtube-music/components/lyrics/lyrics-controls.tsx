// src/modules/youtube-music/components/lyrics/lyrics-controls.tsx
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import {
  Pause,
  Play as PlayIcon,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
} from "lucide-react";
import { usePlayerStore } from "../../stores/player-store";
import { useQueueStore } from "../../stores/queue-store";

export function LyricsControls() {
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const seek = usePlayerStore((s) => s.seek);
  const play = usePlayerStore((s) => s.play);

  const shuffleOn = useQueueStore((s) => s.shuffle);
  const repeat = useQueueStore((s) => s.repeat);
  const queueNext = useQueueStore((s) => s.next);
  const queuePrevious = useQueueStore((s) => s.previous);
  const toggleShuffle = useQueueStore((s) => s.toggleShuffle);
  const cycleRepeat = useQueueStore((s) => s.cycleRepeat);

  const handleNext = () => {
    void queueNext().then((nextId) => {
      if (nextId) play(nextId);
    });
  };

  const handlePrevious = () => {
    if (usePlayerStore.getState().progress > 3) {
      seek(0);
      return;
    }
    void queuePrevious().then((prevId) => {
      if (prevId) play(prevId);
    });
  };

  return (
    <div className="flex items-center gap-2">
      <Toggle
        size="sm"
        pressed={shuffleOn}
        onPressedChange={() => void toggleShuffle()}
        aria-label="Shuffle"
      >
        <Shuffle />
      </Toggle>
      <Button
        variant="ghost"
        size="icon"
        onClick={handlePrevious}
        aria-label="Anterior"
      >
        <SkipBack />
      </Button>
      <Button size="icon-lg" onClick={togglePlay} aria-label="Reproduzir">
        {isPlaying ? <Pause /> : <PlayIcon />}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleNext}
        aria-label="Próxima"
      >
        <SkipForward />
      </Button>
      <Toggle
        size="sm"
        pressed={repeat !== "off"}
        onPressedChange={() => void cycleRepeat()}
        aria-label="Repetir"
      >
        {repeat === "one" ? <Repeat1 /> : <Repeat />}
      </Toggle>
    </div>
  );
}
