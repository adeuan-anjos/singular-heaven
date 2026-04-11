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
  setVideoId?: string | null;
  title: string;
  artists: ArtistBasic[];
  album: { id: string; name: string } | null;
  duration: string;
  durationSeconds: number;
  thumbnails: Thumbnail[];
  likeStatus?: "LIKE" | "DISLIKE" | "INDIFFERENT";
  views?: string;
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
  description?: string;
  monthlyListeners?: string;
  views?: string;
  subscribed?: boolean;
  shuffleId?: string;
  radioId?: string;
  topSongs?: Track[];
  albums?: Album[];
  singles?: Album[];
  videos?: Track[];
  similarArtists?: Artist[];
}

export interface Playlist {
  playlistId: string;
  title: string;
  author: ArtistBasic;
  description?: string | null;
  privacyStatus?: "PUBLIC" | "PRIVATE" | "UNLISTED" | null;
  trackCount?: number;
  thumbnails: Thumbnail[];
  tracks?: Track[];
  isOwnedByUser?: boolean;
  isEditable?: boolean;
  isSpecial?: boolean;
  isSaved?: boolean;
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
  color?: string;
}

export interface SearchResults {
  songs: Track[];
  artists: Artist[];
  albums: Album[];
  playlists: Playlist[];
}

export interface ChartTrack extends Track {
  rank: number;
  trend: "up" | "down" | "neutral";
}

export type RepeatMode = "off" | "all" | "one";

export interface PlayAllOptions {
  queueTrackIds?: string[];
  shuffle?: boolean;
}
