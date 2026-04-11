use sha2::{Sha256, Digest};
use std::path::PathBuf;

/// Get the cache directory for thumbnails
pub fn cache_dir(app_data_dir: &PathBuf) -> PathBuf {
    app_data_dir.join("thumb_cache")
}

/// Generate a deterministic filename from URL + size
pub fn cache_key(url: &str, size: u32) -> String {
    let mut hasher = Sha256::new();
    hasher.update(url.as_bytes());
    hasher.update(size.to_le_bytes());
    format!("{:x}", hasher.finalize())
}

/// Get the cached file path (may not exist yet)
pub fn cached_path(app_data_dir: &PathBuf, url: &str, size: u32) -> PathBuf {
    cache_dir(app_data_dir).join(cache_key(url, size))
}

/// Save bytes to cache
pub fn save(app_data_dir: &PathBuf, url: &str, size: u32, bytes: &[u8]) -> std::io::Result<()> {
    let dir = cache_dir(app_data_dir);
    std::fs::create_dir_all(&dir)?;
    let path = dir.join(cache_key(url, size));
    std::fs::write(&path, bytes)?;
    Ok(())
}

/// Read bytes from cache
pub fn read(app_data_dir: &PathBuf, url: &str, size: u32) -> std::io::Result<Vec<u8>> {
    let path = cached_path(app_data_dir, url, size);
    std::fs::read(&path)
}
