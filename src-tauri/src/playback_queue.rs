use serde::Serialize;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueItemDto {
    pub index: usize,
    pub item_id: u64,
    pub video_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueSnapshot {
    pub current_index: i64,
    pub total_loaded: usize,
    pub playlist_id: Option<String>,
    pub is_complete: bool,
    pub shuffle: bool,
    pub repeat: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueWindowResponse {
    pub items: Vec<QueueItemDto>,
    pub offset: usize,
    pub limit: usize,
    pub snapshot: QueueSnapshot,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueCommandResponse {
    pub track_id: Option<String>,
    pub snapshot: QueueSnapshot,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum RepeatMode {
    Off,
    All,
    One,
}

impl Default for RepeatMode {
    fn default() -> Self {
        Self::Off
    }
}

impl RepeatMode {
    fn as_str(self) -> &'static str {
        match self {
            Self::Off => "off",
            Self::All => "all",
            Self::One => "one",
        }
    }

    fn cycle(self) -> Self {
        match self {
            Self::Off => Self::All,
            Self::All => Self::One,
            Self::One => Self::Off,
        }
    }
}

#[derive(Debug, Clone)]
struct QueueEntry {
    item_id: u64,
    video_id: String,
}

#[derive(Debug, Default)]
pub struct PlaybackQueue {
    source_items: Vec<QueueEntry>,
    playback_items: Vec<QueueEntry>,
    next_item_id: u64,
    current_index: Option<usize>,
    playlist_id: Option<String>,
    is_complete: bool,
    shuffle: bool,
    repeat: RepeatMode,
}

impl PlaybackQueue {
    pub fn snapshot(&self) -> QueueSnapshot {
        QueueSnapshot {
            current_index: self.current_index.map(|idx| idx as i64).unwrap_or(-1),
            total_loaded: self.playback_items.len(),
            playlist_id: self.playlist_id.clone(),
            is_complete: self.is_complete,
            shuffle: self.shuffle,
            repeat: self.repeat.as_str().to_string(),
        }
    }

    pub fn set_queue(
        &mut self,
        track_ids: Vec<String>,
        start_index: usize,
        playlist_id: Option<String>,
        is_complete: bool,
        shuffle: bool,
    ) -> QueueCommandResponse {
        self.source_items.clear();
        self.playback_items.clear();
        self.playlist_id = playlist_id;
        self.is_complete = is_complete;
        self.shuffle = shuffle;

        for video_id in track_ids {
            let item_id = self.alloc_item_id();
            self.source_items.push(QueueEntry { item_id, video_id });
        }

        self.rebuild_playback(start_index);

        QueueCommandResponse {
            track_id: self.current_track_id(),
            snapshot: self.snapshot(),
        }
    }

    pub fn append_playlist_batch(
        &mut self,
        playlist_id: &str,
        new_ids: &[String],
        is_complete: bool,
    ) -> bool {
        if self.playlist_id.as_deref() != Some(playlist_id) {
            return false;
        }

        let mut changed = false;
        for video_id in new_ids {
            let item_id = self.alloc_item_id();
            let entry = QueueEntry {
                item_id,
                video_id: video_id.clone(),
            };
            self.source_items.push(entry.clone());

            if self.shuffle {
                let insert_at = if self.playback_items.is_empty() {
                    0
                } else {
                    let min = self.current_index.map(|idx| idx + 1).unwrap_or(0);
                    random_inclusive(min, self.playback_items.len())
                };
                self.playback_items.insert(insert_at, entry);
            } else {
                self.playback_items.push(entry);
            }

            changed = true;
        }

        if self.is_complete != is_complete {
            self.is_complete = is_complete;
            changed = true;
        }

        if self.current_index.is_none() && !self.playback_items.is_empty() {
            self.current_index = Some(0);
            changed = true;
        }

        changed
    }

    pub fn get_window(&self, offset: usize, limit: usize) -> QueueWindowResponse {
        let items = self
            .playback_items
            .iter()
            .enumerate()
            .skip(offset)
            .take(limit)
            .map(|(index, entry)| QueueItemDto {
                index,
                item_id: entry.item_id,
                video_id: entry.video_id.clone(),
            })
            .collect();

        QueueWindowResponse {
            items,
            offset,
            limit,
            snapshot: self.snapshot(),
        }
    }

    pub fn play_index(&mut self, index: usize) -> QueueCommandResponse {
        if index < self.playback_items.len() {
            self.current_index = Some(index);
        }

        QueueCommandResponse {
            track_id: self.current_track_id(),
            snapshot: self.snapshot(),
        }
    }

    pub fn next_track(&mut self) -> QueueCommandResponse {
        let mut track_id = None;

        if let Some(current_index) = self.current_index {
            if current_index + 1 < self.playback_items.len() {
                self.current_index = Some(current_index + 1);
                track_id = self.current_track_id();
            } else if self.repeat == RepeatMode::All && !self.playback_items.is_empty() {
                self.current_index = Some(0);
                track_id = self.current_track_id();
            }
        }

        QueueCommandResponse {
            track_id,
            snapshot: self.snapshot(),
        }
    }

    pub fn previous_track(&mut self) -> QueueCommandResponse {
        let mut track_id = None;

        if let Some(current_index) = self.current_index {
            if current_index > 0 {
                self.current_index = Some(current_index - 1);
                track_id = self.current_track_id();
            }
        }

        QueueCommandResponse {
            track_id,
            snapshot: self.snapshot(),
        }
    }

    pub fn handle_track_end(&mut self) -> QueueCommandResponse {
        if self.repeat == RepeatMode::One {
            return QueueCommandResponse {
                track_id: self.current_track_id(),
                snapshot: self.snapshot(),
            };
        }

        self.next_track()
    }

    pub fn add_next(&mut self, video_id: String) -> QueueCommandResponse {
        let item_id = self.alloc_item_id();
        let entry = QueueEntry { item_id, video_id };
        let insert_at = self.current_index.map(|idx| idx + 1).unwrap_or(self.source_items.len());

        self.source_items.insert(insert_at.min(self.source_items.len()), entry.clone());
        self.playback_items
            .insert(insert_at.min(self.playback_items.len()), entry);

        QueueCommandResponse {
            track_id: self.current_track_id(),
            snapshot: self.snapshot(),
        }
    }

    pub fn remove_index(&mut self, index: usize) -> QueueCommandResponse {
        if index >= self.playback_items.len() {
            return QueueCommandResponse {
                track_id: self.current_track_id(),
                snapshot: self.snapshot(),
            };
        }

        let removed = self.playback_items.remove(index);
        self.source_items.retain(|entry| entry.item_id != removed.item_id);

        self.current_index = match self.current_index {
            None => None,
            Some(current_index) if self.playback_items.is_empty() => None,
            Some(current_index) if index < current_index => Some(current_index - 1),
            Some(current_index) if index == current_index => {
                Some(current_index.min(self.playback_items.len().saturating_sub(1)))
            }
            Some(current_index) => Some(current_index),
        };

        QueueCommandResponse {
            track_id: self.current_track_id(),
            snapshot: self.snapshot(),
        }
    }

    pub fn toggle_shuffle(&mut self) -> QueueCommandResponse {
        self.shuffle = !self.shuffle;
        let current_item_id = self
            .current_index
            .and_then(|idx| self.playback_items.get(idx))
            .map(|entry| entry.item_id);

        if self.source_items.is_empty() {
            return QueueCommandResponse {
                track_id: None,
                snapshot: self.snapshot(),
            };
        }

        if self.shuffle {
            let Some(current_item_id) = current_item_id else {
                self.rebuild_playback(0);
                return QueueCommandResponse {
                    track_id: self.current_track_id(),
                    snapshot: self.snapshot(),
                };
            };

            let mut rest: Vec<QueueEntry> = self
                .source_items
                .iter()
                .filter(|entry| entry.item_id != current_item_id)
                .cloned()
                .collect();
            shuffle_entries(&mut rest);

            let current = self
                .source_items
                .iter()
                .find(|entry| entry.item_id == current_item_id)
                .cloned();

            self.playback_items.clear();
            if let Some(current) = current {
                self.playback_items.push(current);
                self.playback_items.extend(rest);
                self.current_index = Some(0);
            }
        } else {
            self.playback_items = self.source_items.clone();
            self.current_index = current_item_id.and_then(|item_id| {
                self.playback_items
                    .iter()
                    .position(|entry| entry.item_id == item_id)
            });
        }

        QueueCommandResponse {
            track_id: self.current_track_id(),
            snapshot: self.snapshot(),
        }
    }

    pub fn cycle_repeat(&mut self) -> QueueCommandResponse {
        self.repeat = self.repeat.cycle();
        QueueCommandResponse {
            track_id: self.current_track_id(),
            snapshot: self.snapshot(),
        }
    }

    pub fn clear(&mut self) -> QueueCommandResponse {
        self.source_items.clear();
        self.playback_items.clear();
        self.current_index = None;
        self.playlist_id = None;
        self.is_complete = true;
        self.shuffle = false;
        self.repeat = RepeatMode::Off;

        QueueCommandResponse {
            track_id: None,
            snapshot: self.snapshot(),
        }
    }

    fn current_track_id(&self) -> Option<String> {
        self.current_index
            .and_then(|idx| self.playback_items.get(idx))
            .map(|entry| entry.video_id.clone())
    }

    fn rebuild_playback(&mut self, start_index: usize) {
        if self.source_items.is_empty() {
            self.current_index = None;
            self.playback_items.clear();
            return;
        }

        let safe_start = start_index.min(self.source_items.len().saturating_sub(1));

        if self.shuffle {
            let current = self.source_items[safe_start].clone();
            let mut rest = self.source_items.clone();
            rest.remove(safe_start);
            shuffle_entries(&mut rest);

            self.playback_items.clear();
            self.playback_items.push(current);
            self.playback_items.extend(rest);
            self.current_index = Some(0);
        } else {
            self.playback_items = self.source_items.clone();
            self.current_index = Some(safe_start);
        }
    }

    fn alloc_item_id(&mut self) -> u64 {
        self.next_item_id += 1;
        self.next_item_id
    }
}

fn shuffle_entries(entries: &mut [QueueEntry]) {
    if entries.len() < 2 {
        return;
    }

    for idx in (1..entries.len()).rev() {
        let swap_idx = random_inclusive(0, idx);
        entries.swap(idx, swap_idx);
    }
}

fn random_inclusive(min: usize, max: usize) -> usize {
    if max <= min {
        return min;
    }

    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos() as u64)
        .unwrap_or(0x9E37_79B9);

    let mut value = nanos ^ 0xA5A5_5A5A_1234_5678;
    value ^= value << 13;
    value ^= value >> 7;
    value ^= value << 17;

    let span = (max - min) + 1;
    min + (value as usize % span)
}
