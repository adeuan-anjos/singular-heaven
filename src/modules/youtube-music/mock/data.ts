import type {
  Track,
  Album,
  Artist,
  Playlist,
  HomeSection,
  ExploreData,
  SearchResults,
  MoodCategory,
} from "../types/music";

const PLACEHOLDER_IMG = "https://placehold.co/160x160/1a1a2e/ffffff?text=♪";
const PLACEHOLDER_ARTIST_IMG = "https://placehold.co/160x160/1a1a2e/ffffff?text=🎤";

function thumb(url = PLACEHOLDER_IMG): { url: string; width: number; height: number }[] {
  return [{ url, width: 160, height: 160 }];
}

const BASE_TRACKS: Track[] = [
  { videoId: "t1", title: "Blinding Lights", artists: [{ id: "a1", name: "The Weeknd" }], album: { id: "al1", name: "After Hours" }, duration: "3:20", durationSeconds: 200, thumbnails: thumb() },
  { videoId: "t2", title: "Levitating", artists: [{ id: "a2", name: "Dua Lipa" }], album: { id: "al2", name: "Future Nostalgia" }, duration: "3:23", durationSeconds: 203, thumbnails: thumb() },
  { videoId: "t3", title: "Watermelon Sugar", artists: [{ id: "a3", name: "Harry Styles" }], album: { id: "al3", name: "Fine Line" }, duration: "2:54", durationSeconds: 174, thumbnails: thumb() },
  { videoId: "t4", title: "Stay", artists: [{ id: "a4", name: "The Kid LAROI" }, { id: "a5", name: "Justin Bieber" }], album: null, duration: "2:21", durationSeconds: 141, thumbnails: thumb() },
  { videoId: "t5", title: "Peaches", artists: [{ id: "a5", name: "Justin Bieber" }], album: { id: "al4", name: "Justice" }, duration: "3:18", durationSeconds: 198, thumbnails: thumb() },
  { videoId: "t6", title: "Montero", artists: [{ id: "a6", name: "Lil Nas X" }], album: { id: "al5", name: "Montero" }, duration: "2:17", durationSeconds: 137, thumbnails: thumb() },
  { videoId: "t7", title: "Kiss Me More", artists: [{ id: "a7", name: "Doja Cat" }], album: { id: "al6", name: "Planet Her" }, duration: "3:28", durationSeconds: 208, thumbnails: thumb() },
  { videoId: "t8", title: "Save Your Tears", artists: [{ id: "a1", name: "The Weeknd" }], album: { id: "al1", name: "After Hours" }, duration: "3:35", durationSeconds: 215, thumbnails: thumb() },
  { videoId: "t9", title: "Good 4 U", artists: [{ id: "a8", name: "Olivia Rodrigo" }], album: { id: "al7", name: "SOUR" }, duration: "2:58", durationSeconds: 178, thumbnails: thumb() },
  { videoId: "t10", title: "Happier Than Ever", artists: [{ id: "a9", name: "Billie Eilish" }], album: { id: "al8", name: "Happier Than Ever" }, duration: "4:58", durationSeconds: 298, thumbnails: thumb() },
];

// Generate 50 liked tracks from the 10 base tracks for virtual scroll testing
export const mockTracks: Track[] = Array.from({ length: 50 }, (_, i) => {
  const base = BASE_TRACKS[i % BASE_TRACKS.length];
  const batch = Math.floor(i / BASE_TRACKS.length);
  return {
    ...base,
    videoId: `${base.videoId}_${batch}_${i}`,
    title: batch === 0 ? base.title : `${base.title} (Remix ${batch})`,
  };
});

export const mockAlbums: Album[] = [
  { browseId: "al1", title: "After Hours", artists: [{ id: "a1", name: "The Weeknd" }], year: "2020", thumbnails: thumb(), tracks: mockTracks.filter((t) => t.album?.id === "al1") },
  { browseId: "al2", title: "Future Nostalgia", artists: [{ id: "a2", name: "Dua Lipa" }], year: "2020", thumbnails: thumb() },
  { browseId: "al3", title: "Fine Line", artists: [{ id: "a3", name: "Harry Styles" }], year: "2019", thumbnails: thumb() },
  { browseId: "al4", title: "Justice", artists: [{ id: "a5", name: "Justin Bieber" }], year: "2021", thumbnails: thumb() },
  { browseId: "al5", title: "Montero", artists: [{ id: "a6", name: "Lil Nas X" }], year: "2021", thumbnails: thumb() },
  { browseId: "al6", title: "Planet Her", artists: [{ id: "a7", name: "Doja Cat" }], year: "2021", thumbnails: thumb() },
  { browseId: "al7", title: "SOUR", artists: [{ id: "a8", name: "Olivia Rodrigo" }], year: "2021", thumbnails: thumb() },
  { browseId: "al8", title: "Happier Than Ever", artists: [{ id: "a9", name: "Billie Eilish" }], year: "2021", thumbnails: thumb() },
];

export const mockArtists: Artist[] = [
  { browseId: "a1", name: "The Weeknd", thumbnails: thumb(PLACEHOLDER_ARTIST_IMG), subscribers: "35M", topSongs: mockTracks.filter((t) => t.artists[0].id === "a1"), albums: mockAlbums.filter((a) => a.artists[0].id === "a1"), singles: [], similarArtists: [] },
  { browseId: "a2", name: "Dua Lipa", thumbnails: thumb(PLACEHOLDER_ARTIST_IMG), subscribers: "28M" },
  { browseId: "a3", name: "Harry Styles", thumbnails: thumb(PLACEHOLDER_ARTIST_IMG), subscribers: "22M" },
  { browseId: "a5", name: "Justin Bieber", thumbnails: thumb(PLACEHOLDER_ARTIST_IMG), subscribers: "70M" },
  { browseId: "a7", name: "Doja Cat", thumbnails: thumb(PLACEHOLDER_ARTIST_IMG), subscribers: "18M" },
  { browseId: "a8", name: "Olivia Rodrigo", thumbnails: thumb(PLACEHOLDER_ARTIST_IMG), subscribers: "15M" },
  { browseId: "a9", name: "Billie Eilish", thumbnails: thumb(PLACEHOLDER_ARTIST_IMG), subscribers: "45M" },
];

export const mockPlaylists: Playlist[] = [
  { playlistId: "p1", title: "Meu Mix 1", author: { id: null, name: "YouTube Music" }, trackCount: 25, thumbnails: thumb(), tracks: mockTracks.slice(0, 5) },
  { playlistId: "p2", title: "Descobertas da Semana", author: { id: null, name: "YouTube Music" }, trackCount: 30, thumbnails: thumb(), tracks: mockTracks.slice(3, 8) },
  { playlistId: "p3", title: "Pop Internacional", author: { id: null, name: "YouTube Music" }, trackCount: 50, thumbnails: thumb() },
  { playlistId: "p4", title: "Relax & Chill", author: { id: null, name: "YouTube Music" }, trackCount: 40, thumbnails: thumb() },
  { playlistId: "p5", title: "Workout Hits", author: { id: null, name: "YouTube Music" }, trackCount: 35, thumbnails: thumb() },
];

export const mockHomeSections: HomeSection[] = [
  { title: "Ouvir novamente", contents: mockTracks.slice(0, 6) },
  { title: "Mixes para você", contents: mockPlaylists.slice(0, 4) },
  { title: "Recomendados", contents: mockAlbums.slice(0, 6) },
  { title: "Artistas que você segue", contents: mockArtists.slice(0, 5) },
];

export const mockMoodCategories: MoodCategory[] = [
  { title: "Pop", params: "pop" },
  { title: "Rock", params: "rock" },
  { title: "Hip-Hop", params: "hiphop" },
  { title: "R&B", params: "rnb" },
  { title: "Eletrônica", params: "electronic" },
  { title: "Jazz", params: "jazz" },
  { title: "Clássica", params: "classical" },
  { title: "Sertanejo", params: "sertanejo" },
  { title: "Funk", params: "funk" },
  { title: "MPB", params: "mpb" },
];

export const mockExploreData: ExploreData = {
  newReleases: mockAlbums.slice(0, 6),
  trending: mockTracks.slice(0, 6),
  newVideos: mockTracks.slice(4, 8),
  moodsAndGenres: mockMoodCategories,
};

export const mockSearchResults: SearchResults = {
  songs: mockTracks.slice(0, 5),
  artists: mockArtists.slice(0, 3),
  albums: mockAlbums.slice(0, 3),
  playlists: mockPlaylists.slice(0, 2),
};

export function getMockArtist(artistId: string): Artist {
  const artist = mockArtists.find((a) => a.browseId === artistId);
  if (!artist) return { ...mockArtists[0], browseId: artistId };
  return {
    ...artist,
    topSongs: mockTracks.filter((t) => t.artists.some((a) => a.id === artistId)).concat(mockTracks.slice(0, 3)),
    albums: mockAlbums.filter((a) => a.artists.some((ar) => ar.id === artistId)).concat(mockAlbums.slice(0, 2)),
    singles: mockAlbums.slice(2, 4),
    similarArtists: mockArtists.filter((a) => a.browseId !== artistId).slice(0, 4),
  };
}

export function getMockAlbum(albumId: string): Album {
  const album = mockAlbums.find((a) => a.browseId === albumId);
  if (!album) return { ...mockAlbums[0], browseId: albumId, tracks: mockTracks.slice(0, 8) };
  return { ...album, tracks: mockTracks.slice(0, 8) };
}

export function getMockPlaylist(playlistId: string): Playlist {
  const playlist = mockPlaylists.find((p) => p.playlistId === playlistId);
  if (!playlist) return { ...mockPlaylists[0], playlistId, tracks: mockTracks };
  return { ...playlist, tracks: mockTracks };
}
