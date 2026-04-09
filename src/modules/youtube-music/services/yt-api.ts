import { invoke } from "@tauri-apps/api/core";
import type { Track } from "../types/music";

// ---------------------------------------------------------------------------
// API response types — match the Rust ytmusic-api crate (camelCase via serde)
// ---------------------------------------------------------------------------

export interface ApiThumbnail {
  url: string;
  width: number;
  height: number;
}

export interface ApiArtistRef {
  name: string;
  id: string | null;
}

export interface ApiAlbumRef {
  name: string;
  id: string | null;
}

// Search
export interface ApiSearchResponse {
  topResult: ApiTopResult | null;
  results: ApiSearchResult[];
}

export interface ApiTopResult {
  resultType: string;
  title: string;
  browseId: string | null;
  thumbnails: ApiThumbnail[];
  artists: ApiArtistRef[];
  subscribers: string | null;
}

export type ApiSearchResult =
  | ({ resultType: "song" } & ApiSearchSong)
  | ({ resultType: "video" } & ApiSearchVideo)
  | ({ resultType: "album" } & ApiSearchAlbum)
  | ({ resultType: "artist" } & ApiSearchArtist)
  | ({ resultType: "playlist" } & ApiSearchPlaylist)
  | ({ resultType: "episode" } & ApiSearchEpisode);

export interface ApiSearchSong {
  title: string;
  videoId: string;
  artists: ApiArtistRef[];
  album: ApiAlbumRef | null;
  duration: string | null;
  thumbnails: ApiThumbnail[];
}

export interface ApiSearchVideo {
  title: string;
  videoId: string;
  artists: ApiArtistRef[];
  views: string | null;
  duration: string | null;
  thumbnails: ApiThumbnail[];
}

export interface ApiSearchAlbum {
  title: string;
  browseId: string;
  artists: ApiArtistRef[];
  albumType: string | null;
  year: string | null;
  thumbnails: ApiThumbnail[];
}

export interface ApiSearchArtist {
  title?: string;
  name: string;
  browseId: string;
  subscribers: string | null;
  thumbnails: ApiThumbnail[];
}

export interface ApiSearchPlaylist {
  title: string;
  playlistId: string;
  author: string | null;
  itemCount: string | null;
  thumbnails: ApiThumbnail[];
}

export interface ApiSearchEpisode {
  title: string;
  videoId: string;
  date: string | null;
  podcastName: string | null;
  thumbnails: ApiThumbnail[];
}

export interface ApiSearchSuggestion {
  text: string;
}

// Browsing
export interface ApiArtistPage {
  name: string;
  browseId: string;
  subscribers: string | null;
  description: string | null;
  thumbnails: ApiThumbnail[];
  topSongs: ApiArtistSong[];
  albums: ApiArtistAlbum[];
  singles: ApiArtistAlbum[];
  videos: ApiArtistVideo[];
  similarArtists: ApiSimilarArtist[];
}

export interface ApiArtistSong {
  title: string;
  videoId: string;
  artists: ApiArtistRef[];
  thumbnails: ApiThumbnail[];
  album: ApiAlbumRef | null;
  plays: string | null;
}

export interface ApiArtistAlbum {
  title: string;
  browseId: string;
  year: string | null;
  thumbnails: ApiThumbnail[];
}

export interface ApiArtistVideo {
  title: string;
  videoId: string;
  views: string | null;
  thumbnails: ApiThumbnail[];
}

export interface ApiSimilarArtist {
  name: string;
  browseId: string;
  subscribers: string | null;
  thumbnails: ApiThumbnail[];
}

export interface ApiAlbumPage {
  title: string;
  browseId: string;
  albumType: string | null;
  year: string | null;
  artists: ApiArtistRef[];
  description: string | null;
  thumbnails: ApiThumbnail[];
  tracks: ApiAlbumTrack[];
  trackCount: number | null;
  duration: string | null;
}

export interface ApiAlbumTrack {
  title: string;
  videoId: string;
  trackNumber: number | null;
  duration: string | null;
  artists: ApiArtistRef[];
  thumbnails: ApiThumbnail[];
}

export interface ApiHomeSection {
  title: string;
  contents: ApiHomeItem[];
}

export type ApiHomeItem =
  | { type: "song"; title: string; videoId: string; artists: ApiArtistRef[]; thumbnails: ApiThumbnail[] }
  | { type: "album"; title: string; browseId: string; artists: ApiArtistRef[]; year: string | null; thumbnails: ApiThumbnail[] }
  | { type: "artist"; name: string; browseId: string; subscribers: string | null; thumbnails: ApiThumbnail[] }
  | { type: "playlist"; title: string; playlistId: string; author: string | null; thumbnails: ApiThumbnail[] }
  | { type: "video"; title: string; videoId: string; artists: ApiArtistRef[]; views: string | null; thumbnails: ApiThumbnail[] };

// Explore
export interface ApiExplorePage {
  newReleases: ApiExploreAlbum[];
  topSongs: ApiExploreSong[];
  trending: ApiExploreSong[];
  moodsAndGenres: ApiMoodItem[];
  newVideos: ApiExploreVideo[];
}

export interface ApiExploreAlbum {
  title: string;
  browseId: string;
  artists: ApiArtistRef[];
  thumbnails: ApiThumbnail[];
  isExplicit: boolean;
}

export interface ApiExploreSong {
  title: string;
  videoId: string;
  artists: ApiArtistRef[];
  thumbnails: ApiThumbnail[];
  rank: string | null;
}

export interface ApiExploreVideo {
  title: string;
  videoId: string | null;
  browseId: string | null;
  artists: ApiArtistRef[];
  views: string | null;
  thumbnails: ApiThumbnail[];
}

export interface ApiMoodItem {
  title: string;
  params: string;
  color: number | null;
}

export interface ApiMoodCategory {
  title: string;
  items: ApiMoodItem[];
}

// Library
export interface ApiLibraryPlaylist {
  title: string;
  browseId: string;
  playlistId: string;
  subtitle: string | null;
  thumbnails: ApiThumbnail[];
}

export interface ApiLibrarySong {
  title: string;
  videoId: string;
  artists: ApiArtistRef[];
  duration: string | null;
  thumbnails: ApiThumbnail[];
}

// Playlist
export interface ApiPlaylistPage {
  title: string;
  playlistId: string;
  author: ApiArtistRef | null;
  description: string | null;
  year: string | null;
  trackCount: string | null;
  duration: string | null;
  thumbnails: ApiThumbnail[];
  tracks: ApiPlaylistTrack[];
}

export interface ApiPlaylistTrack {
  title: string;
  videoId: string;
  artists: ApiArtistRef[];
  album: ApiAlbumRef | null;
  duration: string | null;
  thumbnails: ApiThumbnail[];
}

// Watch
export interface ApiWatchPlaylist {
  tracks: ApiWatchTrack[];
  lyricsBrowseId: string | null;
  relatedBrowseId: string | null;
}

export interface ApiWatchTrack {
  title: string;
  videoId: string;
  artists: ApiArtistRef[];
  album: ApiAlbumRef | null;
  duration: string | null;
  thumbnails: ApiThumbnail[];
}

export interface ApiLyrics {
  text: string;
  source: string | null;
}

// Streaming
export interface ApiStreamingData {
  url: string;
  mimeType: string;
  bitrate: number;
  audioQuality: string | null;
  approxDurationMs: string | null;
  audioSampleRate: string | null;
  audioChannels: number | null;
  contentLength: string | null;
}

// Account switching
export interface ApiAccountInfo {
  name: string;
  photoUrl: string | null;
  channelHandle: string | null;
  pageId: string | null;
  hasChannel: boolean;
  isActive: boolean;
}

// Auth
export interface ApiAuthStatus {
  authenticated: boolean;
  method: string;
}

export interface ApiBrowserInfo {
  name: string;
  hasCookies: boolean;
  cookieCount: number;
}

// ---------------------------------------------------------------------------
// API functions — all invoke() calls in one place
// ---------------------------------------------------------------------------

function parseJson<T>(json: string): T {
  return JSON.parse(json) as T;
}

export async function ytSearch(query: string, filter?: string): Promise<ApiSearchResponse> {
  const json = await invoke<string>("yt_search", { query, filter: filter ?? null });
  return parseJson(json);
}

export async function ytSearchSuggestions(query: string): Promise<ApiSearchSuggestion[]> {
  const json = await invoke<string>("yt_search_suggestions", { query });
  return parseJson(json);
}

export async function ytGetHome(limit?: number): Promise<ApiHomeSection[]> {
  const json = await invoke<string>("yt_get_home", { limit: limit ?? null });
  return parseJson(json);
}

export async function ytGetArtist(browseId: string): Promise<ApiArtistPage> {
  const json = await invoke<string>("yt_get_artist", { browseId });
  return parseJson(json);
}

export async function ytGetAlbum(browseId: string): Promise<ApiAlbumPage> {
  const json = await invoke<string>("yt_get_album", { browseId });
  return parseJson(json);
}

export async function ytGetExplore(): Promise<ApiExplorePage> {
  const json = await invoke<string>("yt_get_explore");
  return parseJson(json);
}

export async function ytGetMoodCategories(): Promise<ApiMoodCategory[]> {
  const json = await invoke<string>("yt_get_mood_categories");
  return parseJson(json);
}

export async function ytGetLibraryPlaylists(): Promise<ApiLibraryPlaylist[]> {
  const json = await invoke<string>("yt_get_library_playlists");
  return parseJson(json);
}

export async function ytGetLibrarySongs(): Promise<ApiLibrarySong[]> {
  const json = await invoke<string>("yt_get_library_songs");
  return parseJson(json);
}

export async function ytGetWatchPlaylist(videoId: string): Promise<ApiWatchPlaylist> {
  const json = await invoke<string>("yt_get_watch_playlist", { videoId });
  return parseJson(json);
}

export async function ytGetLyrics(browseId: string): Promise<ApiLyrics> {
  const json = await invoke<string>("yt_get_lyrics", { browseId });
  return parseJson(json);
}

export async function ytAuthStatus(): Promise<ApiAuthStatus> {
  return invoke<ApiAuthStatus>("yt_auth_status");
}

export async function ytDetectBrowsers(): Promise<ApiBrowserInfo[]> {
  return invoke<ApiBrowserInfo[]>("yt_detect_browsers");
}

export async function ytAuthFromBrowser(browser: string): Promise<ApiAuthStatus> {
  return invoke<ApiAuthStatus>("yt_auth_from_browser", { browser });
}

export async function ytAuthLogout(): Promise<ApiAuthStatus> {
  return invoke<ApiAuthStatus>("yt_auth_logout");
}

export async function ytGetStreamUrl(videoId: string): Promise<ApiStreamingData> {
  const json = await invoke<string>("yt_get_stream_url", { videoId });
  return parseJson(json);
}

export async function ytGetAccounts(): Promise<ApiAccountInfo[]> {
  const json = await invoke<string>("yt_get_accounts");
  return parseJson(json);
}

export async function ytSwitchAccount(pageId: string | null): Promise<ApiAccountInfo[]> {
  const json = await invoke<string>("yt_switch_account", { pageId });
  return parseJson(json);
}

// ── Cached playlist commands ──

export interface LoadPlaylistResponse {
  playlistId: string;
  title: string;
  author: { name: string; id: string | null } | null;
  trackCount: string | null;
  thumbnails: { url: string; width: number; height: number }[];
  tracks: Track[];
  trackIds: string[];
  isComplete: boolean;
}

export async function ytLoadPlaylist(playlistId: string): Promise<LoadPlaylistResponse> {
  const json = await invoke<string>("yt_load_playlist", { playlistId });
  return parseJson(json);
}

export interface PlaylistTrackIdsResponse {
  trackIds: string[];
  isComplete: boolean;
}

export async function ytGetPlaylistTrackIds(playlistId: string): Promise<PlaylistTrackIdsResponse> {
  const json = await invoke<string>("yt_get_playlist_track_ids", { playlistId });
  return parseJson(json);
}

export interface PlaylistWindowItem extends Track {
  position: number;
}

export interface PlaylistWindowResponse {
  items: PlaylistWindowItem[];
  offset: number;
  limit: number;
  totalLoaded: number;
  isComplete: boolean;
}

export async function ytGetPlaylistWindow(
  playlistId: string,
  offset: number,
  limit: number
): Promise<PlaylistWindowResponse> {
  const json = await invoke<string>("yt_get_playlist_window", { playlistId, offset, limit });
  return parseJson(json);
}

export async function ytGetCachedTracks(videoIds: string[]): Promise<Track[]> {
  const json = await invoke<string>("yt_get_cached_tracks", { videoIds });
  return parseJson(json);
}

export interface QueueSnapshot {
  currentIndex: number;
  totalLoaded: number;
  playlistId: string | null;
  isComplete: boolean;
  shuffle: boolean;
  repeat: "off" | "all" | "one";
}

export interface QueueWindowItem {
  index: number;
  itemId: number;
  videoId: string;
}

export interface QueueWindowResponse {
  items: QueueWindowItem[];
  offset: number;
  limit: number;
  snapshot: QueueSnapshot;
}

export interface QueueCommandResponse {
  trackId: string | null;
  snapshot: QueueSnapshot;
}

export async function ytQueueSet(
  trackIds: string[],
  startIndex: number,
  playlistId: string | null,
  isComplete: boolean,
  shuffle: boolean
): Promise<QueueCommandResponse> {
  return invoke<QueueCommandResponse>("yt_queue_set", {
    trackIds,
    startIndex,
    playlistId,
    isComplete,
    shuffle,
  });
}

export async function ytQueueGetState(): Promise<QueueSnapshot> {
  return invoke<QueueSnapshot>("yt_queue_get_state");
}

export async function ytQueueGetWindow(offset: number, limit: number): Promise<QueueWindowResponse> {
  return invoke<QueueWindowResponse>("yt_queue_get_window", { offset, limit });
}

export async function ytQueuePlayIndex(index: number): Promise<QueueCommandResponse> {
  return invoke<QueueCommandResponse>("yt_queue_play_index", { index });
}

export async function ytQueueNext(): Promise<QueueCommandResponse> {
  return invoke<QueueCommandResponse>("yt_queue_next");
}

export async function ytQueuePrevious(): Promise<QueueCommandResponse> {
  return invoke<QueueCommandResponse>("yt_queue_previous");
}

export async function ytQueueHandleTrackEnd(): Promise<QueueCommandResponse> {
  return invoke<QueueCommandResponse>("yt_queue_handle_track_end");
}

export async function ytQueueAddNext(videoId: string): Promise<QueueCommandResponse> {
  return invoke<QueueCommandResponse>("yt_queue_add_next", { videoId });
}

export async function ytQueueRemove(index: number): Promise<QueueCommandResponse> {
  return invoke<QueueCommandResponse>("yt_queue_remove", { index });
}

export async function ytQueueToggleShuffle(): Promise<QueueCommandResponse> {
  return invoke<QueueCommandResponse>("yt_queue_toggle_shuffle");
}

export async function ytQueueCycleRepeat(): Promise<QueueCommandResponse> {
  return invoke<QueueCommandResponse>("yt_queue_cycle_repeat");
}

export async function ytQueueClear(): Promise<QueueCommandResponse> {
  return invoke<QueueCommandResponse>("yt_queue_clear");
}
