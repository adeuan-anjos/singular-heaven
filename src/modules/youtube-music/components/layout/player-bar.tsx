import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Toggle } from "@/components/ui/toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  SkipBack,
  SkipForward,
  Play as PlayIcon,
  Pause,
  Shuffle,
  Repeat,
  Repeat1,
  Volume2,
  ListMusic,
} from "lucide-react";
import type { Track, RepeatMode } from "../../types/music";

interface PlayerBarProps {
  track: Track | null;
  isPlaying: boolean;
  progress: number;
  volume: number;
  shuffleOn: boolean;
  repeat: RepeatMode;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onSeek: (value: number) => void;
  onVolumeChange: (value: number) => void;
  onToggleShuffle: () => void;
  onCycleRepeat: () => void;
  onOpenQueue: () => void;
  onGoToArtist?: (artistId: string) => void;
  onGoToAlbum?: (albumId: string) => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function PlayerBar({
  track,
  isPlaying,
  progress,
  volume,
  shuffleOn,
  repeat,
  onTogglePlay,
  onNext,
  onPrevious,
  onSeek,
  onVolumeChange,
  onToggleShuffle,
  onCycleRepeat,
  onOpenQueue,
  onGoToArtist,
  onGoToAlbum,
}: PlayerBarProps) {
  if (!track) return null;

  const imgUrl = track.thumbnails[0]?.url ?? "";
  const artistName = track.artists.map((a) => a.name).join(", ");

  return (
    <div className="flex items-center gap-4 border-t border-border bg-background px-4 py-2">
      <button
        type="button"
        className="flex items-center gap-3 min-w-0 flex-shrink-0"
        onClick={() => track.album && onGoToAlbum?.(track.album.id)}
      >
        <Avatar className="h-12 w-12 rounded-md">
          <AvatarImage src={imgUrl} alt={track.title} className="object-cover" />
          <AvatarFallback className="rounded-md">{track.title.charAt(0)}</AvatarFallback>
        </Avatar>
      </button>

      <div className="min-w-0 w-48 flex-shrink-0">
        <p className="truncate text-sm font-medium text-foreground">{track.title}</p>
        <button
          type="button"
          className="truncate text-xs text-muted-foreground hover:underline"
          onClick={() => track.artists[0]?.id && onGoToArtist?.(track.artists[0].id)}
        >
          {artistName}
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center gap-1">
        <div className="flex items-center gap-2">
          <Toggle size="sm" pressed={shuffleOn} onPressedChange={() => onToggleShuffle()} aria-label="Shuffle">
            <Shuffle className="h-4 w-4" />
          </Toggle>
          <Tooltip>
            <TooltipTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8" onClick={onPrevious} />}>
              <SkipBack className="h-4 w-4" />
            </TooltipTrigger>
            <TooltipContent>Anterior</TooltipContent>
          </Tooltip>
          <Button size="icon" className="h-9 w-9" onClick={onTogglePlay}>
            {isPlaying ? <Pause className="h-5 w-5" /> : <PlayIcon className="h-5 w-5" />}
          </Button>
          <Tooltip>
            <TooltipTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8" onClick={onNext} />}>
              <SkipForward className="h-4 w-4" />
            </TooltipTrigger>
            <TooltipContent>Próxima</TooltipContent>
          </Tooltip>
          <Toggle
            size="sm"
            pressed={repeat !== "off"}
            onPressedChange={() => onCycleRepeat()}
            aria-label="Repetir"
          >
            {repeat === "one" ? <Repeat1 className="h-4 w-4" /> : <Repeat className="h-4 w-4" />}
          </Toggle>
        </div>
        <div className="flex w-full max-w-md items-center gap-2">
          <span className="w-10 text-right text-xs text-muted-foreground">{formatTime(progress)}</span>
          <Slider
            value={[progress]}
            max={track.durationSeconds}
            step={1}
            onValueChange={(v) => onSeek(Array.isArray(v) ? v[0] : v)}
            className="flex-1"
          />
          <span className="w-10 text-xs text-muted-foreground">{track.duration}</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Volume2 className="h-4 w-4 text-muted-foreground" />
        <Slider
          value={[volume]}
          max={100}
          step={1}
          onValueChange={(v) => onVolumeChange(Array.isArray(v) ? v[0] : v)}
          className="w-24"
        />
        <Tooltip>
          <TooltipTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8" onClick={onOpenQueue} />}>
            <ListMusic className="h-4 w-4" />
          </TooltipTrigger>
          <TooltipContent>Fila de reprodução</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
