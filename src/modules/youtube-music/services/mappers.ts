import type { Track, Album, Artist, Playlist, ArtistBasic, Thumbnail, HomeSection, ExploreData, MoodCategory, ChartTrack, SearchResults } from "../types/music";
import type {
  ApiArtistRef,
  ApiThumbnail,
  ApiSearchResponse,
  ApiArtistPage,
  ApiArtistSong,
  ApiArtistAlbum,
  ApiArtistVideo,
  ApiSimilarArtist,
  ApiAlbumPage,
  ApiAlbumTrack,
  ApiHomeSection,
  ApiHomeItem,
  ApiExplorePage,
  ApiExploreSong,
  ApiExploreAlbum,
  ApiExploreVideo,
  ApiMoodItem,
  ApiLibraryPlaylist,
  ApiLibrarySong,
  ApiPlaylistPage,
  ApiPlaylistTrack,
  ApiWatchPlaylist,
  ApiWatchTrack,
} from "./yt-api";

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

function mapArtistRef(ref: ApiArtistRef): ArtistBasic {
  return { id: ref.id, name: ref.name };
}

function mapThumbnails(thumbnails: ApiThumbnail[]): Thumbnail[] {
  return thumbnails;
}

/** Parse "3:49" or "1:23:45" → seconds */
function parseDuration(dur: string | null): number {
  if (!dur) return 0;
  const parts = dur.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

// ---------------------------------------------------------------------------
// Search → frontend types
// ---------------------------------------------------------------------------

export function mapSearchResults(response: ApiSearchResponse): SearchResults {
  const songs: Track[] = [];
  const artists: Artist[] = [];
  const albums: Album[] = [];
  const playlists: Playlist[] = [];

  for (const result of response.results) {
    switch (result.resultType) {
      case "song":
        songs.push({
          videoId: result.videoId,
          title: result.title,
          artists: result.artists.map(mapArtistRef),
          album: result.album ? { id: result.album.id ?? "", name: result.album.name } : null,
          duration: result.duration ?? "0:00",
          durationSeconds: parseDuration(result.duration),
          thumbnails: mapThumbnails(result.thumbnails),
        });
        break;
      case "video":
        songs.push({
          videoId: result.videoId,
          title: result.title,
          artists: result.artists.map(mapArtistRef),
          album: null,
          duration: result.duration ?? "0:00",
          durationSeconds: parseDuration(result.duration),
          thumbnails: mapThumbnails(result.thumbnails),
          views: result.views ?? undefined,
        });
        break;
      case "album":
        albums.push({
          browseId: result.browseId,
          title: result.title,
          artists: result.artists.map(mapArtistRef),
          year: result.year ?? undefined,
          thumbnails: mapThumbnails(result.thumbnails),
        });
        break;
      case "artist":
        artists.push({
          browseId: result.browseId,
          name: result.name,
          thumbnails: mapThumbnails(result.thumbnails),
          subscribers: result.subscribers ?? undefined,
        });
        break;
      case "playlist":
        playlists.push({
          playlistId: result.playlistId,
          title: result.title,
          author: { id: null, name: result.author ?? "" },
          thumbnails: mapThumbnails(result.thumbnails),
        });
        break;
    }
  }

  return { songs, artists, albums, playlists };
}

// ---------------------------------------------------------------------------
// Artist
// ---------------------------------------------------------------------------

function mapArtistSong(song: ApiArtistSong): Track {
  return {
    videoId: song.videoId,
    title: song.title,
    artists: song.artists.map(mapArtistRef),
    album: song.album ? { id: song.album.id ?? "", name: song.album.name } : null,
    duration: "",
    durationSeconds: 0,
    thumbnails: mapThumbnails(song.thumbnails),
    views: song.plays ?? undefined,
  };
}

function mapArtistAlbum(album: ApiArtistAlbum): Album {
  return {
    browseId: album.browseId,
    title: album.title,
    artists: [],
    year: album.year ?? undefined,
    thumbnails: mapThumbnails(album.thumbnails),
  };
}

function mapArtistVideo(video: ApiArtistVideo): Track {
  return {
    videoId: video.videoId,
    title: video.title,
    artists: [],
    album: null,
    duration: "0:00",
    durationSeconds: 0,
    thumbnails: mapThumbnails(video.thumbnails),
    views: video.views ?? undefined,
  };
}

function mapSimilarArtist(artist: ApiSimilarArtist): Artist {
  return {
    browseId: artist.browseId,
    name: artist.name,
    thumbnails: mapThumbnails(artist.thumbnails),
    subscribers: artist.subscribers ?? undefined,
  };
}

export function mapArtistPage(page: ApiArtistPage): Artist {
  return {
    browseId: page.browseId,
    name: page.name,
    thumbnails: mapThumbnails(page.thumbnails),
    subscribers: page.subscribers ?? undefined,
    description: page.description ?? undefined,
    topSongs: page.topSongs.map(mapArtistSong),
    albums: page.albums.map(mapArtistAlbum),
    singles: page.singles.map(mapArtistAlbum),
    videos: page.videos.map(mapArtistVideo),
    similarArtists: page.similarArtists.map(mapSimilarArtist),
  };
}

// ---------------------------------------------------------------------------
// Album
// ---------------------------------------------------------------------------

function mapAlbumTrack(track: ApiAlbumTrack, albumArtists: ArtistBasic[], albumThumbnails: Thumbnail[]): Track {
  const artists = track.artists.length > 0
    ? track.artists.map(mapArtistRef)
    : albumArtists;

  // Album tracks often have no individual thumbnails — use album cover as fallback
  const thumbnails = track.thumbnails.length > 0
    ? mapThumbnails(track.thumbnails)
    : albumThumbnails;

  return {
    videoId: track.videoId,
    title: track.title,
    artists,
    album: null,
    duration: track.duration ?? "0:00",
    durationSeconds: parseDuration(track.duration),
    thumbnails,
  };
}

export function mapAlbumPage(page: ApiAlbumPage): Album {
  const albumArtists = page.artists.map(mapArtistRef);
  const albumThumbnails = mapThumbnails(page.thumbnails);
  return {
    browseId: page.browseId,
    title: page.title,
    artists: albumArtists,
    year: page.year ?? undefined,
    thumbnails: albumThumbnails,
    tracks: page.tracks.map((t) => mapAlbumTrack(t, albumArtists, albumThumbnails)),
  };
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------

function mapHomeItem(item: ApiHomeItem): Track | Album | Artist | Playlist {
  switch (item.type) {
    case "song":
    case "video":
      return {
        videoId: item.videoId,
        title: item.title,
        artists: item.artists.map(mapArtistRef),
        album: null,
        duration: "0:00",
        durationSeconds: 0,
        thumbnails: mapThumbnails(item.thumbnails),
        views: item.type === "video" ? (item.views ?? undefined) : undefined,
      } satisfies Track;
    case "album":
      return {
        browseId: item.browseId,
        title: item.title,
        artists: item.artists.map(mapArtistRef),
        year: item.year ?? undefined,
        thumbnails: mapThumbnails(item.thumbnails),
      } satisfies Album;
    case "artist":
      return {
        browseId: item.browseId,
        name: item.name,
        thumbnails: mapThumbnails(item.thumbnails),
        subscribers: item.subscribers ?? undefined,
      } satisfies Artist;
    case "playlist":
      return {
        playlistId: item.playlistId,
        title: item.title,
        author: { id: null, name: item.author ?? "" },
        thumbnails: mapThumbnails(item.thumbnails),
      } satisfies Playlist;
  }
}

export function mapHomeSections(sections: ApiHomeSection[]): HomeSection[] {
  return sections.map((s) => ({
    title: s.title,
    contents: s.contents.map(mapHomeItem),
  }));
}

// ---------------------------------------------------------------------------
// Explore
// ---------------------------------------------------------------------------

function mapExploreSong(song: ApiExploreSong): Track {
  return {
    videoId: song.videoId,
    title: song.title,
    artists: song.artists.map(mapArtistRef),
    album: null,
    duration: "0:00",
    durationSeconds: 0,
    thumbnails: mapThumbnails(song.thumbnails),
  };
}

function mapExploreAlbum(album: ApiExploreAlbum): Album {
  return {
    browseId: album.browseId,
    title: album.title,
    artists: album.artists.map(mapArtistRef),
    thumbnails: mapThumbnails(album.thumbnails),
  };
}

function mapExploreVideo(video: ApiExploreVideo): Track {
  return {
    videoId: video.videoId ?? "",
    title: video.title,
    artists: video.artists.map(mapArtistRef),
    album: null,
    duration: "0:00",
    durationSeconds: 0,
    thumbnails: mapThumbnails(video.thumbnails),
    views: video.views ?? undefined,
  };
}

function mapMoodItem(item: ApiMoodItem): MoodCategory {
  return {
    title: item.title,
    params: item.params,
    color: item.color != null ? `#${(item.color & 0xffffff).toString(16).padStart(6, "0")}` : undefined,
  };
}

export function mapExploreSongToChart(song: ApiExploreSong, index: number): ChartTrack {
  return {
    ...mapExploreSong(song),
    rank: song.rank ? parseInt(song.rank, 10) : index + 1,
    trend: "neutral" as const,
  };
}

export function mapExplorePage(page: ApiExplorePage): ExploreData {
  return {
    newReleases: page.newReleases.map(mapExploreAlbum),
    trending: page.trending.map(mapExploreSong),
    newVideos: page.newVideos.map(mapExploreVideo),
    moodsAndGenres: page.moodsAndGenres.map(mapMoodItem),
  };
}

// ---------------------------------------------------------------------------
// Library
// ---------------------------------------------------------------------------

export function mapLibraryPlaylists(playlists: ApiLibraryPlaylist[]): Playlist[] {
  return playlists.map((p) => ({
    playlistId: p.playlistId,
    title: p.title,
    author: { id: null, name: "" },
    thumbnails: mapThumbnails(p.thumbnails),
    isOwnedByUser: p.isOwnedByUser,
    isEditable: p.isEditable,
    isSpecial: p.isSpecial,
    isSaved: !p.isSpecial,
  }));
}

export function mapLibrarySongs(songs: ApiLibrarySong[]): Track[] {
  return songs.map((s) => ({
    videoId: s.videoId,
    title: s.title,
    artists: s.artists.map(mapArtistRef),
    album: null,
    duration: s.duration ?? "0:00",
    durationSeconds: parseDuration(s.duration),
    thumbnails: mapThumbnails(s.thumbnails),
    likeStatus: s.likeStatus ?? "LIKE",
  }));
}

// ---------------------------------------------------------------------------
// Playlist
// ---------------------------------------------------------------------------

export function mapPlaylistTrack(track: ApiPlaylistTrack): Track {
  return {
    videoId: track.videoId,
    setVideoId: track.setVideoId,
    title: track.title,
    artists: track.artists.map(mapArtistRef),
    album: track.album ? { id: track.album.id ?? "", name: track.album.name } : null,
    duration: track.duration ?? "0:00",
    durationSeconds: parseDuration(track.duration),
    thumbnails: mapThumbnails(track.thumbnails),
  };
}

export function mapPlaylistPage(page: ApiPlaylistPage): Playlist {
  return {
    playlistId: page.playlistId,
    title: page.title,
    author: page.author ? mapArtistRef(page.author) : { id: null, name: "" },
    description: page.description,
    privacyStatus: page.privacyStatus,
    trackCount: page.trackCount ? parseInt(page.trackCount, 10) : undefined,
    thumbnails: mapThumbnails(page.thumbnails),
    isOwnedByUser: page.isOwnedByUser,
    isEditable: page.isEditable,
    isSpecial: page.isSpecial,
    tracks: page.tracks.map(mapPlaylistTrack),
  };
}

// ---------------------------------------------------------------------------
// Watch
// ---------------------------------------------------------------------------

function mapWatchTrack(track: ApiWatchTrack): Track {
  return {
    videoId: track.videoId,
    title: track.title,
    artists: track.artists.map(mapArtistRef),
    album: track.album ? { id: track.album.id ?? "", name: track.album.name } : null,
    duration: track.duration ?? "0:00",
    durationSeconds: parseDuration(track.duration),
    thumbnails: mapThumbnails(track.thumbnails),
  };
}

export function mapWatchPlaylist(watch: ApiWatchPlaylist) {
  return {
    tracks: watch.tracks.map(mapWatchTrack),
    lyricsBrowseId: watch.lyricsBrowseId,
    relatedBrowseId: watch.relatedBrowseId,
  };
}
