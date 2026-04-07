import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { TrackRow } from "../shared/track-row";
import { TrackContextMenu } from "../shared/track-context-menu";
import { getMockPlaylist } from "../../mock/data";
import { Play as PlayIcon } from "lucide-react";
import type { Track, StackPage } from "../../types/music";

interface PlaylistPageProps {
  playlistId: string;
  onNavigate: (page: StackPage) => void;
  onPlayTrack: (track: Track) => void;
  onAddToQueue: (track: Track) => void;
  onPlayAll: (tracks: Track[]) => void;
}

export function PlaylistPage({ playlistId, onNavigate, onPlayTrack, onAddToQueue, onPlayAll }: PlaylistPageProps) {
  const playlist = getMockPlaylist(playlistId);
  const imgUrl = playlist.thumbnails[0]?.url ?? "";

  return (
    <ScrollArea className="group/page h-full">
      <div className="space-y-6 p-4">
        <div className="flex items-start gap-6">
          <Avatar className="h-48 w-48 rounded-md">
            <AvatarImage src={imgUrl} alt={playlist.title} className="object-cover" />
            <AvatarFallback className="rounded-md text-4xl">{playlist.title.charAt(0)}</AvatarFallback>
          </Avatar>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-foreground">{playlist.title}</h1>
            <p className="text-sm text-muted-foreground">{playlist.author.name}</p>
            {playlist.trackCount && (
              <p className="text-sm text-muted-foreground">{playlist.trackCount} músicas</p>
            )}
            <Button
              className="mt-2"
              onClick={() => playlist.tracks && onPlayAll(playlist.tracks)}
            >
              <PlayIcon className="mr-2 h-4 w-4" />
              Tocar tudo
            </Button>
          </div>
        </div>

        {playlist.tracks && (
          <div className="space-y-1">
            {playlist.tracks.map((track, i) => (
              <TrackContextMenu
                key={track.videoId}
                track={track}
                onPlay={onPlayTrack}
                onAddToQueue={onAddToQueue}
                onGoToArtist={(id) => onNavigate({ type: "artist", artistId: id })}
                onGoToAlbum={(id) => onNavigate({ type: "album", albumId: id })}
              >
                <div>
                  <TrackRow
                    track={track}
                    index={i}
                    onPlay={onPlayTrack}
                    onAddToQueue={onAddToQueue}
                    onGoToArtist={(id) => onNavigate({ type: "artist", artistId: id })}
                    onGoToAlbum={(id) => onNavigate({ type: "album", albumId: id })}
                  />
                </div>
              </TrackContextMenu>
            ))}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
