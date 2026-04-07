import type {
  Track,
  Album,
  Artist,
  Playlist,
  HomeSection,
  ExploreData,
  SearchResults,
  MoodCategory,
  ChartTrack,
} from "../types/music";

const PLACEHOLDER_IMG = "https://placehold.co/160x160/1a1a2e/ffffff?text=♪";
const PLACEHOLDER_ARTIST_IMG = "https://placehold.co/160x160/1a1a2e/ffffff?text=🎤";

function thumb(url = PLACEHOLDER_IMG): { url: string; width: number; height: number }[] {
  return [{ url, width: 160, height: 160 }];
}

const BASE_TRACKS: Track[] = [
  { videoId: "t1", title: "Blinding Lights", artists: [{ id: "a1", name: "The Weeknd" }], album: { id: "al1", name: "After Hours" }, duration: "3:20", durationSeconds: 200, thumbnails: thumb(), views: "Tocou 4,5 bi vezes" },
  { videoId: "t2", title: "Levitating", artists: [{ id: "a2", name: "Dua Lipa" }], album: { id: "al2", name: "Future Nostalgia" }, duration: "3:23", durationSeconds: 203, thumbnails: thumb(), views: "Tocou 2,1 bi vezes" },
  { videoId: "t3", title: "Watermelon Sugar", artists: [{ id: "a3", name: "Harry Styles" }], album: { id: "al3", name: "Fine Line" }, duration: "2:54", durationSeconds: 174, thumbnails: thumb(), views: "Tocou 1,8 bi vezes" },
  { videoId: "t4", title: "Stay", artists: [{ id: "a4", name: "The Kid LAROI" }, { id: "a5", name: "Justin Bieber" }], album: null, duration: "2:21", durationSeconds: 141, thumbnails: thumb(), views: "Tocou 1,2 bi vezes" },
  { videoId: "t5", title: "Peaches", artists: [{ id: "a5", name: "Justin Bieber" }], album: { id: "al4", name: "Justice" }, duration: "3:18", durationSeconds: 198, thumbnails: thumb(), views: "Tocou 890 mi vezes" },
  { videoId: "t6", title: "Montero", artists: [{ id: "a6", name: "Lil Nas X" }], album: { id: "al5", name: "Montero" }, duration: "2:17", durationSeconds: 137, thumbnails: thumb(), views: "Tocou 760 mi vezes" },
  { videoId: "t7", title: "Kiss Me More", artists: [{ id: "a7", name: "Doja Cat" }], album: { id: "al6", name: "Planet Her" }, duration: "3:28", durationSeconds: 208, thumbnails: thumb(), views: "Tocou 620 mi vezes" },
  { videoId: "t8", title: "Save Your Tears", artists: [{ id: "a1", name: "The Weeknd" }], album: { id: "al1", name: "After Hours" }, duration: "3:35", durationSeconds: 215, thumbnails: thumb(), views: "Tocou 500 mi vezes" },
  { videoId: "t9", title: "Good 4 U", artists: [{ id: "a8", name: "Olivia Rodrigo" }], album: { id: "al7", name: "SOUR" }, duration: "2:58", durationSeconds: 178, thumbnails: thumb(), views: "Tocou 380 mi vezes" },
  { videoId: "t10", title: "Happier Than Ever", artists: [{ id: "a9", name: "Billie Eilish" }], album: { id: "al8", name: "Happier Than Ever" }, duration: "4:58", durationSeconds: 298, thumbnails: thumb(), views: "Tocou 119 mi vezes" },
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
  { browseId: "a1", name: "The Weeknd", thumbnails: thumb(PLACEHOLDER_ARTIST_IMG), subscribers: "35M", monthlyListeners: "355 mi ouvintes mensais", views: "12B visualizações", description: "Abel Makkonen Tesfaye, conhecido profissionalmente como The Weeknd, é um cantor, compositor e produtor canadense. Conhecido por sua versatilidade vocal e produção sombria, ele é um dos artistas mais influentes da música pop contemporânea.", subscribed: false, shuffleId: "shuffle_a1", radioId: "radio_a1", topSongs: mockTracks.filter((t) => t.artists[0].id === "a1"), albums: mockAlbums.filter((a) => a.artists[0].id === "a1"), singles: [], videos: [], similarArtists: [] },
  { browseId: "a2", name: "Dua Lipa", thumbnails: thumb(PLACEHOLDER_ARTIST_IMG), subscribers: "28M", monthlyListeners: "280 mi ouvintes mensais", views: "8B visualizações", description: "Dua Lipa é uma cantora e compositora britânica de origem albanesa. Ganhou destaque mundial com hits como 'New Rules' e 'Don't Start Now'.", subscribed: true, shuffleId: "shuffle_a2", radioId: "radio_a2" },
  { browseId: "a3", name: "Harry Styles", thumbnails: thumb(PLACEHOLDER_ARTIST_IMG), subscribers: "22M", monthlyListeners: "190 mi ouvintes mensais", views: "5B visualizações", description: "Harry Styles é um cantor, compositor e ator britânico, ex-integrante do One Direction.", subscribed: false, shuffleId: "shuffle_a3", radioId: "radio_a3" },
  { browseId: "a5", name: "Justin Bieber", thumbnails: thumb(PLACEHOLDER_ARTIST_IMG), subscribers: "70M", monthlyListeners: "400 mi ouvintes mensais", views: "30B visualizações", description: "Justin Bieber é um cantor e compositor canadense. Descoberto na internet, tornou-se um dos artistas mais vendidos de todos os tempos.", subscribed: false, shuffleId: "shuffle_a5", radioId: "radio_a5" },
  { browseId: "a7", name: "Doja Cat", thumbnails: thumb(PLACEHOLDER_ARTIST_IMG), subscribers: "18M", monthlyListeners: "150 mi ouvintes mensais", views: "4B visualizações", description: "Doja Cat é uma rapper, cantora e compositora americana conhecida por sua versatilidade musical e presença criativa.", subscribed: false, shuffleId: "shuffle_a7", radioId: "radio_a7" },
  { browseId: "a8", name: "Olivia Rodrigo", thumbnails: thumb(PLACEHOLDER_ARTIST_IMG), subscribers: "15M", monthlyListeners: "120 mi ouvintes mensais", views: "3B visualizações", description: "Olivia Rodrigo é uma cantora, compositora e atriz americana. Seu álbum de estreia 'SOUR' foi um fenômeno cultural.", subscribed: false, shuffleId: "shuffle_a8", radioId: "radio_a8" },
  { browseId: "a9", name: "Billie Eilish", thumbnails: thumb(PLACEHOLDER_ARTIST_IMG), subscribers: "45M", monthlyListeners: "300 mi ouvintes mensais", views: "15B visualizações", description: "Billie Eilish é uma cantora e compositora americana que redefiniu o pop com seu estilo único e produção intimista.", subscribed: true, shuffleId: "shuffle_a9", radioId: "radio_a9" },
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
  { title: "Hip-Hop", params: "hiphop", color: "bg-orange-500" },
  { title: "Festa", params: "party", color: "bg-pink-500" },
  { title: "Games", params: "games", color: "bg-indigo-500" },
  { title: "Rock", params: "rock", color: "bg-red-500" },
  { title: "Reggae", params: "reggae", color: "bg-green-500" },
  { title: "Pop BR", params: "pop-br", color: "bg-yellow-500" },
  { title: "Treino", params: "workout", color: "bg-emerald-500" },
  { title: "Forró", params: "forro", color: "bg-teal-500" },
  { title: "Jazz", params: "jazz", color: "bg-blue-500" },
  { title: "Especial", params: "special", color: "bg-purple-500" },
  { title: "Eletrônica", params: "electronic", color: "bg-cyan-500" },
  { title: "MPB", params: "mpb", color: "bg-lime-500" },
  { title: "Sertanejo", params: "sertanejo", color: "bg-amber-500" },
  { title: "Funk", params: "funk", color: "bg-rose-500" },
  { title: "R&B", params: "rnb", color: "bg-violet-500" },
  { title: "Clássica", params: "classical", color: "bg-sky-500" },
  { title: "Pop", params: "pop", color: "bg-fuchsia-500" },
  { title: "K-Pop", params: "kpop", color: "bg-pink-400" },
  { title: "Relax", params: "relax", color: "bg-teal-400" },
  { title: "Romântico", params: "romantic", color: "bg-red-400" },
  { title: "Pagode", params: "pagode", color: "bg-orange-400" },
  { title: "Axé", params: "axe", color: "bg-yellow-400" },
  { title: "Gospel", params: "gospel", color: "bg-blue-400" },
  { title: "Metal", params: "metal", color: "bg-zinc-500" },
];

export const mockChartTracks: ChartTrack[] = [
  { ...BASE_TRACKS[0], rank: 1, trend: "up" },
  { ...BASE_TRACKS[1], rank: 2, trend: "up" },
  { ...BASE_TRACKS[2], rank: 3, trend: "down" },
  { ...BASE_TRACKS[3], rank: 4, trend: "neutral" },
  { ...BASE_TRACKS[4], rank: 5, trend: "up" },
  { ...BASE_TRACKS[5], rank: 6, trend: "neutral" },
  { ...BASE_TRACKS[6], rank: 7, trend: "up" },
  { ...BASE_TRACKS[7], rank: 8, trend: "down" },
  { ...BASE_TRACKS[8], rank: 9, trend: "up" },
  { ...BASE_TRACKS[9], rank: 10, trend: "down" },
  { videoId: "t11", title: "Drivers License", artists: [{ id: "a8", name: "Olivia Rodrigo" }], album: { id: "al7", name: "SOUR" }, duration: "4:02", durationSeconds: 242, thumbnails: thumb(), rank: 11, trend: "up" },
  { videoId: "t12", title: "Therefore I Am", artists: [{ id: "a9", name: "Billie Eilish" }], album: { id: "al8", name: "Happier Than Ever" }, duration: "2:54", durationSeconds: 174, thumbnails: thumb(), rank: 12, trend: "neutral" },
  { videoId: "t13", title: "Don't Start Now", artists: [{ id: "a2", name: "Dua Lipa" }], album: { id: "al2", name: "Future Nostalgia" }, duration: "3:03", durationSeconds: 183, thumbnails: thumb(), rank: 13, trend: "down" },
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
    videos: mockTracks.slice(0, 4),
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
