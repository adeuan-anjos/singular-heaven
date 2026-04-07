import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { TrackContextMenu } from "../shared/track-context-menu";
import { getMockPlaylist } from "../../mock/data";
import { usePlayerStore } from "../../stores/player-store";
import {
  Play,
  Pause,
  Shuffle,
  Heart,
  Ellipsis,
  Search,
} from "lucide-react";
import type { Track, StackPage } from "../../types/music";

interface PlaylistPageProps {
  playlistId: string;
  onNavigate: (page: StackPage) => void;
  onPlayTrack: (track: Track) => void;
  onAddToQueue: (track: Track) => void;
  onPlayAll: (tracks: Track[]) => void;
}

export function PlaylistPage({
  playlistId,
  onNavigate,
  onPlayTrack,
  onAddToQueue,
  onPlayAll,
}: PlaylistPageProps) {
  const playlist = getMockPlaylist(playlistId);
  const imgUrl = playlist.thumbnails[0]?.url ?? "";
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const [filter, setFilter] = useState("");
  const [liked, setLiked] = useState(false);

  const tracks = playlist.tracks ?? [];
  const filteredTracks = filter
    ? tracks.filter((t) => {
        const q = filter.toLowerCase();
        return (
          t.title.toLowerCase().includes(q) ||
          t.artists.some((a) => a.name.toLowerCase().includes(q)) ||
          (t.album?.name.toLowerCase().includes(q) ?? false)
        );
      })
    : tracks;

  return (
    <ScrollArea className="group/page h-full">
      <div className="mx-auto max-w-screen-xl space-y-6 p-4">
        {/* Header */}
        <div className="flex items-start gap-6">
          <div className="flex h-48 w-48 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-muted">
            {imgUrl ? (
              <img
                src={imgUrl}
                alt={playlist.title}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-4xl text-muted-foreground">
                {playlist.title.charAt(0)}
              </span>
            )}
          </div>

          <div className="flex min-h-48 flex-col justify-between py-1">
            <div className="space-y-1">
              <h1 className="text-4xl font-bold text-foreground">
                {playlist.title}
              </h1>
              <p className="text-sm text-muted-foreground">
                {playlist.author.id ? (
                  <button
                    type="button"
                    className="hover:underline"
                    onClick={() =>
                      playlist.author.id &&
                      onNavigate({
                        type: "artist",
                        artistId: playlist.author.id,
                      })
                    }
                  >
                    {playlist.author.name}
                  </button>
                ) : (
                  <span>{playlist.author.name}</span>
                )}
                {playlist.trackCount != null && (
                  <span> &bull; {playlist.trackCount} músicas</span>
                )}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => onPlayAll(tracks)}
              >
                <Play className="mr-1.5 h-4 w-4" />
                Reproduzir
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  const shuffled = [...tracks].sort(() => Math.random() - 0.5);
                  onPlayAll(shuffled);
                }}
              >
                <Shuffle className="mr-1.5 h-4 w-4" />
                Aleatório
              </Button>

              <div className="flex-1" />

              <Button
                variant="ghost"
                size="icon"
                onClick={() => setLiked(!liked)}
                aria-label="Curtir playlist"
              >
                <Heart
                  className={`h-4 w-4 ${liked ? "fill-red-500 text-red-500" : ""}`}
                />
              </Button>
              <Button variant="ghost" size="icon" aria-label="Mais opções">
                <Ellipsis className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Filter */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtrar a playlist por título, artista ou álbum"
            className="pl-8"
          />
        </div>

        {/* Track table */}
        {filteredTracks.length > 0 && (
          <div>
            {/* Column headers */}
            <div className="grid grid-cols-[2rem_2.5rem_1fr_1fr_1fr_3rem] items-center gap-x-3 px-2 pb-2">
              <span className="text-center text-xs uppercase tracking-wider text-muted-foreground">
                #
              </span>
              <span />
              <span className="text-xs uppercase tracking-wider text-muted-foreground">
                Título
              </span>
              <span className="text-xs uppercase tracking-wider text-muted-foreground">
                Artista
              </span>
              <span className="text-xs uppercase tracking-wider text-muted-foreground">
                Álbum
              </span>
              <span className="text-right text-xs uppercase tracking-wider text-muted-foreground">
                Dur.
              </span>
            </div>
            <Separator />

            {/* Rows */}
            <div className="mt-1 space-y-0.5">
              {filteredTracks.map((track, i) => {
                const isCurrent =
                  currentTrack?.videoId === track.videoId;
                const trackImgUrl = track.thumbnails[0]?.url ?? "";
                const artistName = track.artists
                  .map((a) => a.name)
                  .join(", ");

                return (
                  <TrackContextMenu
                    key={track.videoId}
                    track={track}
                    onPlay={onPlayTrack}
                    onAddToQueue={onAddToQueue}
                    onGoToArtist={(id) =>
                      onNavigate({ type: "artist", artistId: id })
                    }
                    onGoToAlbum={(id) =>
                      onNavigate({ type: "album", albumId: id })
                    }
                  >
                    <div
                      className={`group grid grid-cols-[2rem_2.5rem_1fr_1fr_1fr_3rem] items-center gap-x-3 rounded-md px-2 py-1.5 hover:bg-accent ${isCurrent ? "bg-accent/50" : ""}`}
                      onDoubleClick={() => onPlayTrack(track)}
                    >
                      {/* # / play indicator */}
                      <div className="flex items-center justify-center">
                        <div className="group-hover:hidden">
                          {isCurrent && isPlaying ? (
                            <div className="equalizer">
                              <span />
                              <span />
                              <span />
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              {i + 1}
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          className="hidden items-center justify-center group-hover:flex"
                          onClick={() => onPlayTrack(track)}
                        >
                          {isCurrent && isPlaying ? (
                            <Pause className="h-4 w-4 text-foreground" />
                          ) : (
                            <Play className="h-4 w-4 text-foreground" />
                          )}
                        </button>
                      </div>

                      {/* Thumbnail */}
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-muted">
                        {trackImgUrl ? (
                          <img
                            src={trackImgUrl}
                            alt={track.title}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            {track.title.charAt(0)}
                          </span>
                        )}
                      </div>

                      {/* Title */}
                      <p
                        className={`truncate text-sm font-medium ${isCurrent ? "text-primary" : "text-foreground"}`}
                      >
                        {track.title}
                      </p>

                      {/* Artist */}
                      <p className="truncate text-sm text-muted-foreground">
                        <button
                          type="button"
                          className="hover:underline"
                          onClick={(e) => {
                            e.stopPropagation();
                            track.artists[0]?.id &&
                              onNavigate({
                                type: "artist",
                                artistId: track.artists[0].id,
                              });
                          }}
                        >
                          {artistName}
                        </button>
                      </p>

                      {/* Album */}
                      <p className="truncate text-sm text-muted-foreground">
                        {track.album ? (
                          <button
                            type="button"
                            className="hover:underline"
                            onClick={(e) => {
                              e.stopPropagation();
                              onNavigate({
                                type: "album",
                                albumId: track.album!.id,
                              });
                            }}
                          >
                            {track.album.name}
                          </button>
                        ) : (
                          <span>&mdash;</span>
                        )}
                      </p>

                      {/* Duration */}
                      <span className="text-right text-xs text-muted-foreground">
                        {track.duration}
                      </span>
                    </div>
                  </TrackContextMenu>
                );
              })}
            </div>
          </div>
        )}

        {filteredTracks.length === 0 && filter && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma música encontrada para &ldquo;{filter}&rdquo;
          </p>
        )}
      </div>
    </ScrollArea>
  );
}
