import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Toggle } from "@/components/ui/toggle";
import {
  SkipBack,
  SkipForward,
  Play as PlayIcon,
  Pause,
  Shuffle,
  Repeat,
  Repeat1,
  Volume2,
  VolumeX,
  List,
  Heart,
} from "lucide-react";
import { usePlayerStore } from "../../stores/player-store";
import { useQueueStore } from "../../stores/queue-store";
import { useTrack } from "../../stores/track-cache-store";
import { useRenderTracker } from "@/lib/debug";
import { ProgressBar } from "./progress-bar";
import { thumbUrl } from "../../utils/thumb-url";

interface PlayerBarProps {
  onOpenQueue: () => void;
  onGoToArtist?: (artistId: string) => void;
  onGoToAlbum?: (albumId: string) => void;
}

export function PlayerBar({ onOpenQueue, onGoToArtist, onGoToAlbum }: PlayerBarProps) {
  useRenderTracker("PlayerBar", { onOpenQueue, onGoToArtist, onGoToAlbum });
  const [liked, setLiked] = useState(false);

  const currentTrackId = usePlayerStore((s) => s.currentTrackId);
  const track = useTrack(currentTrackId ?? undefined);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const volume = usePlayerStore((s) => s.volume);
  const shuffleOn = usePlayerStore((s) => s.shuffle);
  const repeat = usePlayerStore((s) => s.repeat);

  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const seek = usePlayerStore((s) => s.seek);
  const setVolume = usePlayerStore((s) => s.setVolume);
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);
  const cycleRepeat = usePlayerStore((s) => s.cycleRepeat);
  const play = usePlayerStore((s) => s.play);

  const queueNext = useQueueStore((s) => s.next);
  const queuePrevious = useQueueStore((s) => s.previous);

  console.log("[PlayerBar] render", { track: track?.title });

  if (!track) return null;

  // Use the largest available thumbnail (last in array = highest resolution)
  const imgUrl = track.thumbnails[0]?.url ?? "";
  const artistName = track.artists.map((a) => a.name).join(", ");

  const handleNext = () => {
    const nextId = queueNext();
    if (nextId) play(nextId);
  };

  const handlePrevious = () => {
    if (usePlayerStore.getState().progress > 3) {
      seek(0);
      return;
    }
    const prevId = queuePrevious();
    if (prevId) play(prevId);
  };

  return (
    <div className="grid grid-cols-3 items-center border-t border-border bg-background px-4 py-2">
      {/* Left: Track info */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          className="shrink-0"
          onClick={() => track.album && onGoToAlbum?.(track.album.id)}
        >
          <Avatar className="h-12 w-12 rounded-md">
            <AvatarImage src={thumbUrl(imgUrl, 96)} alt={track.title} className="object-cover" />
            <AvatarFallback className="rounded-md">{track.title.charAt(0)}</AvatarFallback>
          </Avatar>
        </button>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{track.title}</p>
          <p className="truncate text-xs text-muted-foreground">
            <button
              type="button"
              className="hover:underline"
              onClick={() => track.artists[0]?.id && onGoToArtist?.(track.artists[0].id)}
            >
              {artistName}
            </button>
            {track.album && (
              <>
                {" • "}
                <button
                  type="button"
                  className="hover:underline"
                  onClick={() => onGoToAlbum?.(track.album!.id)}
                >
                  {track.album.name}
                </button>
              </>
            )}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setLiked(!liked)}
          aria-label="Curtir"
          className="h-8 w-8 shrink-0"
        >
          <Heart className={`h-4 w-4 ${liked ? "fill-red-500 text-red-500" : ""}`} />
        </Button>
      </div>

      {/* Center: Controls + progress */}
      <div className="flex flex-col items-center gap-1">
        <div className="flex items-center gap-2">
          <Toggle size="sm" pressed={shuffleOn} onPressedChange={() => toggleShuffle()} aria-label="Shuffle">
            <Shuffle className="h-4 w-4" />
          </Toggle>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handlePrevious}>
            <SkipBack className="h-4 w-4" />
          </Button>
          <Button size="icon" className="h-9 w-9" onClick={togglePlay}>
            {isPlaying ? <Pause className="h-5 w-5" /> : <PlayIcon className="h-5 w-5" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleNext}>
            <SkipForward className="h-4 w-4" />
          </Button>
          <Toggle
            size="sm"
            pressed={repeat !== "off"}
            onPressedChange={() => cycleRepeat()}
            aria-label="Repetir"
          >
            {repeat === "one" ? <Repeat1 className="h-4 w-4" /> : <Repeat className="h-4 w-4" />}
          </Toggle>
        </div>
        <ProgressBar />
      </div>

      {/* Right: Volume + queue */}
      <div className="flex items-center justify-end gap-1">
        <Popover>
          <PopoverTrigger
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
            aria-label="Volume"
          >
            {volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </PopoverTrigger>
          <PopoverContent side="top" align="center" className="w-10 px-2 py-4">
            <Slider
              value={[volume]}
              max={100}
              step={1}
              orientation="vertical"
              onValueChange={(v) => setVolume(Array.isArray(v) ? v[0] : v)}
              className="h-24"
              aria-label="Volume"
            />
          </PopoverContent>
        </Popover>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onOpenQueue}>
          <List className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
