use std::path::PathBuf;

#[tokio::main]
async fn main() {
    println!("=== ytmusic-api search example ===\n");

    let path = PathBuf::from(std::env::var("APPDATA").unwrap_or_default())
        .join("com.singularhaven.app")
        .join("yt_cookies.txt");

    println!("[example] Reading cookies from: {}", path.display());
    let cookies = match std::fs::read_to_string(&path) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("[example] Failed to read cookies: {e}");
            eprintln!("[example] Make sure you've authenticated via the app first.");
            return;
        }
    };
    println!("[example] Cookie length: {} chars\n", cookies.len());

    let client = ytmusic_api::YtMusicClient::from_cookies(&cookies)
        .expect("Failed to create client");

    // Test 1: Search
    println!("=== Test 1: Search 'The Weeknd' ===\n");
    match client.search("The Weeknd", None).await {
        Ok(response) => {
            if let Some(ref top) = response.top_result {
                println!("  Top result: {} ({}) [{}]", top.title, top.result_type,
                    top.browse_id.as_deref().unwrap_or("N/A"));
            }
            println!("  Total results: {}", response.results.len());
            for (i, result) in response.results.iter().enumerate().take(10) {
                let json = serde_json::to_string(result).unwrap_or_default();
                println!("  [{i}] {json}");
            }
        }
        Err(e) => eprintln!("  ERROR: {e}"),
    }

    // Test 2: Search with filter
    println!("\n=== Test 2: Search 'The Weeknd' (songs only) ===\n");
    match client.search("The Weeknd", Some("songs")).await {
        Ok(response) => {
            println!("  Results: {}", response.results.len());
            for (i, result) in response.results.iter().enumerate().take(5) {
                let json = serde_json::to_string(result).unwrap_or_default();
                println!("  [{i}] {json}");
            }
        }
        Err(e) => eprintln!("  ERROR: {e}"),
    }

    // Test 3: Search suggestions
    println!("\n=== Test 3: Search suggestions 'blinding' ===\n");
    match client.get_search_suggestions("blinding").await {
        Ok(suggestions) => {
            println!("  Suggestions: {}", suggestions.len());
            for s in &suggestions {
                println!("    - {}", s.text);
            }
        }
        Err(e) => eprintln!("  ERROR: {e}"),
    }

    // Test 4: Get artist
    println!("\n=== Test 4: Get artist (The Weeknd) ===\n");
    match client.get_artist("UClYV6hHlupm_S_ObS1W-DYw").await {
        Ok(artist) => {
            println!("  Name: {}", artist.name);
            println!("  Subscribers: {:?}", artist.subscribers);
            println!("  Top songs: {}", artist.top_songs.len());
            for s in artist.top_songs.iter().take(3) {
                println!("    - {} ({})", s.title, s.video_id);
            }
            println!("  Albums: {}", artist.albums.len());
            println!("  Singles: {}", artist.singles.len());
            println!("  Similar: {}", artist.similar_artists.len());
        }
        Err(e) => eprintln!("  ERROR: {e}"),
    }

    // Test 5: Get album
    println!("\n=== Test 5: Get album (Starboy) ===\n");
    match client.get_album("MPREb_FWIMEPTHFsY").await {
        Ok(album) => {
            println!("  Title: {}", album.title);
            println!("  Type: {:?}", album.album_type);
            println!("  Year: {:?}", album.year);
            println!("  Artists: {:?}", album.artists.iter().map(|a| &a.name).collect::<Vec<_>>());
            println!("  Tracks: {}", album.tracks.len());
            for t in album.tracks.iter().take(5) {
                println!("    {}. {} ({}) [{}]",
                    t.track_number.unwrap_or(0), t.title,
                    t.duration.as_deref().unwrap_or("?"), t.video_id);
            }
        }
        Err(e) => eprintln!("  ERROR: {e}"),
    }

    // Test 6: Get home
    println!("\n=== Test 6: Get home ===\n");
    match client.get_home(3).await {
        Ok(sections) => {
            println!("  Sections: {}", sections.len());
            for s in &sections {
                println!("  - {} ({} items)", s.title, s.contents.len());
            }
        }
        Err(e) => eprintln!("  ERROR: {e}"),
    }

    // Test 7: Explore
    println!("\n=== Test 7: Get explore ===\n");
    match client.get_explore().await {
        Ok(explore) => {
            println!("  New releases: {}", explore.new_releases.len());
            println!("  Top songs: {}", explore.top_songs.len());
            println!("  Trending: {}", explore.trending.len());
            println!("  Moods: {}", explore.moods_and_genres.len());
            println!("  New videos: {}", explore.new_videos.len());
        }
        Err(e) => eprintln!("  ERROR: {e}"),
    }

    // Test 8: Mood categories
    println!("\n=== Test 8: Mood categories ===\n");
    match client.get_mood_categories().await {
        Ok(categories) => {
            println!("  Categories: {}", categories.len());
            for c in &categories {
                println!("  - {} ({} items)", c.title, c.items.len());
            }
        }
        Err(e) => eprintln!("  ERROR: {e}"),
    }

    // Test 9: Library playlists
    println!("\n=== Test 9: Library playlists ===\n");
    match client.get_library_playlists().await {
        Ok(playlists) => {
            println!("  Playlists: {}", playlists.len());
            for p in &playlists {
                println!("    - {} ({})", p.title, p.playlist_id);
            }
        }
        Err(e) => eprintln!("  ERROR: {e}"),
    }

    // Test 10: Library songs
    println!("\n=== Test 10: Library songs ===\n");
    match client.get_library_songs().await {
        Ok(songs) => {
            println!("  Songs: {}", songs.len());
            for s in songs.iter().take(5) {
                println!("    - {} ({}) [{}]", s.title, s.duration.as_deref().unwrap_or("?"), s.video_id);
            }
        }
        Err(e) => eprintln!("  ERROR: {e}"),
    }

    // Test 11: Get playlist (Liked songs)
    println!("\n=== Test 11: Get playlist (Liked songs) ===\n");
    match client.get_playlist("LM").await {
        Ok(playlist) => {
            println!("  Title: {}", playlist.title);
            println!("  Author: {:?}", playlist.author.as_ref().map(|a| &a.name));
            println!("  Tracks: {}", playlist.tracks.len());
            for t in playlist.tracks.iter().take(5) {
                println!("    - {} ({}) [{}]", t.title, t.duration.as_deref().unwrap_or("?"), t.video_id);
            }
        }
        Err(e) => eprintln!("  ERROR: {e}"),
    }

    // Test 12: Watch playlist
    println!("\n=== Test 12: Watch playlist ===\n");
    match client.get_watch_playlist(ytmusic_api::types::watch::WatchPlaylistRequest::for_video_radio("ZtEtKXhhtS4", 25)).await {
        Ok(watch) => {
            println!("  Queue: {} tracks", watch.tracks.len());
            println!("  Lyrics browseId: {:?}", watch.lyrics_browse_id);
            println!("  Related browseId: {:?}", watch.related_browse_id);
            for t in watch.tracks.iter().take(3) {
                println!("    - {} by {:?} [{}]", t.title, t.artists.first().map(|a| &a.name), t.video_id);
            }

            // Test 13: Get lyrics
            if let Some(ref lyrics_id) = watch.lyrics_browse_id {
                println!("\n=== Test 13: Get lyrics ===\n");
                match client.get_lyrics(lyrics_id).await {
                    Ok(lyrics) => {
                        let preview = &lyrics.text[..lyrics.text.len().min(200)];
                        println!("  Lyrics preview: {}...", preview);
                        println!("  Source: {:?}", lyrics.source);
                    }
                    Err(e) => eprintln!("  ERROR: {e}"),
                }
            }
        }
        Err(e) => eprintln!("  ERROR: {e}"),
    }

    println!("\n=== Done ===");
}
