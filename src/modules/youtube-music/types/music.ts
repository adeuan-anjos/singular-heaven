export interface Thumbnail {
  url: string;
  width: number;
  height: number;
}

export interface ArtistBasic {
  id: string | null;
  name: string;
}

export interface Track {
  videoId: string;
  title: string;
  artists: ArtistBasic[];
  album: { id: string; name: string } | null;
  duration: string;
  durationSeconds: number;
  thumbnails: Thumbnail[];
  likeStatus?: "LIKE" | "DISLIKE" | "INDIFFERENT";
}

export interface Album {
  browseId: string;
  title: string;
  artists: ArtistBasic[];
  year?: string;
  thumbnails: Thumbnail[];
  tracks?: Track[];
}

export interface Artist {
  browseId: string;
  name: string;
  thumbnails: Thumbnail[];
  subscribers?: string;
  topSongs?: Track[];
  albums?: Album[];
  singles?: Album[];
  similarArtists?: Artist[];
}

export interface Playlist {
  playlistId: string;
  title: string;
  author: ArtistBasic;
  trackCount?: number;
  thumbnails: Thumbnail[];
  tracks?: Track[];
}

export interface HomeSection {
  title: string;
  contents: (Album | Playlist | Track | Artist)[];
}

export interface ExploreData {
  newReleases: Album[];
  trending: Track[];
  newVideos: Track[];
  moodsAndGenres: MoodCategory[];
}

export interface MoodCategory {
  title: string;
  params: string;
}

export interface SearchResults {
  songs: Track[];
  artists: Artist[];
  albums: Album[];
  playlists: Playlist[];
}

export type StackPage =
  | { type: "artist"; artistId: string }
  | { type: "album"; albumId: string }
  | { type: "playlist"; playlistId: string }
  | { type: "search" }
  | { type: "mood"; params: string; title: string };

export type RepeatMode = "off" | "all" | "one";
