import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { TrackRow } from "../shared/track-row";
import { TrackContextMenu } from "../shared/track-context-menu";
import { getMockAlbum } from "../../mock/data";
import { Play as PlayIcon } from "lucide-react";
import type { Track, StackPage } from "../../types/music";

interface AlbumPageProps {
  albumId: string;
  onNavigate: (page: StackPage) => void;
  onPlayTrack: (track: Track) => void;
  onAddToQueue: (track: Track) => void;
  onPlayAll: (tracks: Track[]) => void;
}

export function AlbumPage({ albumId, onNavigate, onPlayTrack, onAddToQueue, onPlayAll }: AlbumPageProps) {
  const album = getMockAlbum(albumId);
  const imgUrl = album.thumbnails[0]?.url ?? "";
  const artistName = album.artists.map((a) => a.name).join(", ");

  return (
    <ScrollArea className="h-full">
      <div className="space-y-6 p-4">
        <div className="flex items-start gap-6">
          <Avatar className="h-48 w-48 rounded-md">
            <AvatarImage src={imgUrl} alt={album.title} className="object-cover" />
            <AvatarFallback className="rounded-md text-4xl">{album.title.charAt(0)}</AvatarFallback>
          </Avatar>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-foreground">{album.title}</h1>
            <button
              type="button"
              className="text-sm text-muted-foreground hover:underline"
              onClick={() => album.artists[0]?.id && onNavigate({ type: "artist", artistId: album.artists[0].id })}
            >
              {artistName}
            </button>
            {album.year && <p className="text-sm text-muted-foreground">{album.year}</p>}
            {album.tracks && (
              <p className="text-sm text-muted-foreground">{album.tracks.length} músicas</p>
            )}
            <Button
              className="mt-2"
              onClick={() => album.tracks && onPlayAll(album.tracks)}
            >
              <PlayIcon className="mr-2 h-4 w-4" />
              Tocar tudo
            </Button>
          </div>
        </div>

        {album.tracks && (
          <div className="space-y-1">
            {album.tracks.map((track, i) => (
              <TrackContextMenu
                key={track.videoId}
                track={track}
                onPlay={onPlayTrack}
                onAddToQueue={onAddToQueue}
                onGoToArtist={(id) => onNavigate({ type: "artist", artistId: id })}
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
