export const paths = {
  home: "/home",
  explore: "/explore",
  library: "/library",
  artist: (id: string) => `/artist/${encodeURIComponent(id)}`,
  artistSongs: (id: string) => `/artist/${encodeURIComponent(id)}/songs`,
  album: (id: string) => `/album/${encodeURIComponent(id)}`,
  playlist: (id: string) => `/playlist/${encodeURIComponent(id)}`,
  search: (query: string) => `/search?${new URLSearchParams({ q: query }).toString()}`,
  mood: (params: string, title: string) =>
    `/mood?${new URLSearchParams({ params, title }).toString()}`,
} as const;
