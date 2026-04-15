use serde::Serialize;
use std::collections::HashSet;
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
    pub is_radio: bool,
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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RadioSeedKind {
    Video,
    Playlist,
    Album,
    Artist,
}

impl RadioSeedKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Video => "video",
            Self::Playlist => "playlist",
            Self::Album => "album",
            Self::Artist => "artist",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "video" => Some(Self::Video),
            "playlist" => Some(Self::Playlist),
            "album" => Some(Self::Album),
            "artist" => Some(Self::Artist),
            _ => None,
        }
    }
}

#[derive(Debug, Clone)]
pub struct RadioSeed {
    pub kind: RadioSeedKind,
    pub id: String,
}

#[derive(Debug, Clone)]
pub struct RadioState {
    pub seed: RadioSeed,
    pub continuation: Option<String>,
    pub pool_exhausted: bool,
    pub loaded_count: usize,
    /// In-flight guard — true while a continuation request is being fetched.
    /// Prevents the track-end trigger and the scroll-trigger from racing each
    /// other when the user happens to scroll while a track ends.
    pub fetching: bool,
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
    history_item_ids: Vec<u64>,
    queued_next_item_ids: Vec<u64>,
    rng_state: u64,
    radio_state: Option<RadioState>,
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
            is_radio: self.radio_state.is_some(),
        }
    }

    pub fn set_radio_state(&mut self, state: RadioState) {
        self.radio_state = Some(state);
    }

    pub fn radio_state(&self) -> Option<&RadioState> {
        self.radio_state.as_ref()
    }

    pub fn radio_state_mut(&mut self) -> Option<&mut RadioState> {
        self.radio_state.as_mut()
    }

    pub fn set_is_complete(&mut self, complete: bool) {
        if self.is_complete != complete {
            self.is_complete = complete;
        }
    }

    pub fn clear_radio(&mut self) {
        if self.radio_state.is_some() {
        }
        self.radio_state = None;
    }

    /// Quantas faixas sobram depois da posição atual. Used by
    /// `yt_queue_handle_track_end` to decide whether to trigger a lazy radio
    /// continuation fetch as natural playback approaches the end of the queue.
    pub fn remaining_after_current(&self) -> usize {
        match self.current_index {
            Some(idx) if idx < self.playback_items.len() => {
                self.playback_items.len().saturating_sub(idx + 1)
            }
            _ => 0,
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
        self.history_item_ids.clear();
        self.queued_next_item_ids.clear();
        self.playlist_id = playlist_id;
        self.is_complete = is_complete;
        self.shuffle = shuffle;
        self.clear_radio();
        self.reset_rng_state();

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
            let entry = QueueEntry {
                item_id: self.alloc_item_id(),
                video_id: video_id.clone(),
            };

            self.source_items.push(entry.clone());

            if self.shuffle {
                self.insert_shuffled_future_entry(entry);
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

        if changed {
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
            let _from = self.current_index;
            self.move_to_index(index, true);
        }

        QueueCommandResponse {
            track_id: self.current_track_id(),
            snapshot: self.snapshot(),
        }
    }

    pub fn next_track(&mut self) -> QueueCommandResponse {
        let Some(current_index) = self.current_index else {
            if !self.playback_items.is_empty() {
                self.current_index = Some(0);
            }
            return QueueCommandResponse {
                track_id: self.current_track_id(),
                snapshot: self.snapshot(),
            };
        };

        let next_index = if current_index + 1 < self.playback_items.len() {
            Some(current_index + 1)
        } else {
            None
        };

        if let Some(next_index) = next_index {
            let _from = self.current_index;
            self.move_to_index(next_index, true);
            return QueueCommandResponse {
                track_id: self.current_track_id(),
                snapshot: self.snapshot(),
            };
        }

        if self.repeat == RepeatMode::All && !self.playback_items.is_empty() {
            if self.shuffle {
                self.restart_shuffled_cycle();
            } else {
                let _from = self.current_index;
                self.move_to_index(0, true);
            }

            return QueueCommandResponse {
                track_id: self.current_track_id(),
                snapshot: self.snapshot(),
            };
        }

        QueueCommandResponse {
            track_id: None,
            snapshot: self.snapshot(),
        }
    }

    pub fn previous_track(&mut self) -> QueueCommandResponse {
        if self.playback_items.is_empty() {
            return QueueCommandResponse {
                track_id: None,
                snapshot: self.snapshot(),
            };
        }

        if self.shuffle {
            while let Some(previous_item_id) = self.history_item_ids.pop() {
                if let Some(previous_index) = self.find_playback_index(previous_item_id) {
                    let _from = self.current_index;
                    self.move_to_index(previous_index, false);
                    return QueueCommandResponse {
                        track_id: self.current_track_id(),
                        snapshot: self.snapshot(),
                    };
                }
            }

            if self.repeat == RepeatMode::All {
                let _from = self.current_index;
                self.move_to_index(self.playback_items.len().saturating_sub(1), false);
                return QueueCommandResponse {
                    track_id: self.current_track_id(),
                    snapshot: self.snapshot(),
                };
            }
        } else if let Some(current_index) = self.current_index {
            if current_index > 0 {
                let _from = self.current_index;
                self.move_to_index(current_index - 1, false);
                return QueueCommandResponse {
                    track_id: self.current_track_id(),
                    snapshot: self.snapshot(),
                };
            }

            if self.repeat == RepeatMode::All {
                let _from = self.current_index;
                self.move_to_index(self.playback_items.len().saturating_sub(1), false);
                return QueueCommandResponse {
                    track_id: self.current_track_id(),
                    snapshot: self.snapshot(),
                };
            }
        }

        QueueCommandResponse {
            track_id: self.current_track_id(),
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
        let entry = QueueEntry {
            item_id: self.alloc_item_id(),
            video_id,
        };
        self.insert_entry_next(entry);

        QueueCommandResponse {
            track_id: self.current_track_id(),
            snapshot: self.snapshot(),
        }
    }

    pub fn add_collection_next(&mut self, track_ids: Vec<String>) -> QueueCommandResponse {
        if track_ids.is_empty() {
            return QueueCommandResponse {
                track_id: self.current_track_id(),
                snapshot: self.snapshot(),
            };
        }

        self.detach_from_playlist();

        let entries = track_ids
            .into_iter()
            .map(|video_id| QueueEntry {
                item_id: self.alloc_item_id(),
                video_id,
            })
            .collect::<Vec<_>>();
        self.insert_collection_next(entries);

        QueueCommandResponse {
            track_id: self.current_track_id(),
            snapshot: self.snapshot(),
        }
    }

    pub fn append_collection(&mut self, track_ids: Vec<String>) -> QueueCommandResponse {
        if track_ids.is_empty() {
            return QueueCommandResponse {
                track_id: self.current_track_id(),
                snapshot: self.snapshot(),
            };
        }

        self.detach_from_playlist();

        for video_id in track_ids {
            let entry = QueueEntry {
                item_id: self.alloc_item_id(),
                video_id,
            };
            self.source_items.push(entry.clone());
            if self.shuffle {
                self.insert_shuffled_future_entry(entry);
            } else {
                self.playback_items.push(entry);
            }
        }

        if self.current_index.is_none() && !self.playback_items.is_empty() {
            self.current_index = Some(0);
        }

        self.prune_state();

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
        self.history_item_ids.retain(|item_id| *item_id != removed.item_id);
        self.queued_next_item_ids
            .retain(|item_id| *item_id != removed.item_id);

        self.current_index = match self.current_index {
            None => None,
            Some(_) if self.playback_items.is_empty() => None,
            Some(current_index) if index < current_index => Some(current_index - 1),
            Some(current_index) if index == current_index => {
                Some(current_index.min(self.playback_items.len().saturating_sub(1)))
            }
            Some(current_index) => Some(current_index),
        };

        self.prune_state();

        QueueCommandResponse {
            track_id: self.current_track_id(),
            snapshot: self.snapshot(),
        }
    }

    pub fn toggle_shuffle(&mut self) -> QueueCommandResponse {
        self.shuffle = !self.shuffle;

        if self.source_items.is_empty() {
            return QueueCommandResponse {
                track_id: None,
                snapshot: self.snapshot(),
            };
        }

        let current_item_id = self
            .current_item_id()
            .or_else(|| self.source_items.first().map(|entry| entry.item_id));

        if let Some(current_item_id) = current_item_id {
            if self.shuffle {
                let played_prefix_ids = self
                    .current_index
                    .map(|current_index| {
                        self.playback_items[..current_index]
                            .iter()
                            .map(|entry| entry.item_id)
                            .collect::<Vec<_>>()
                    })
                    .unwrap_or_default();
                self.rebuild_shuffled_with_prefix(current_item_id, &played_prefix_ids);
            } else {
                self.playback_items = self.source_items.clone();
                self.current_index = self.find_playback_index(current_item_id);
            }
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
        self.history_item_ids.clear();
        self.queued_next_item_ids.clear();
        self.current_index = None;
        self.playlist_id = None;
        self.is_complete = true;
        self.shuffle = false;
        self.repeat = RepeatMode::Off;
        self.rng_state = 0;
        self.clear_radio();

        QueueCommandResponse {
            track_id: None,
            snapshot: self.snapshot(),
        }
    }

    /// Descarta as faixas depois do currentIndex, tanto na ordem linear quanto na shuffled.
    /// Preserva a faixa atual, o histórico e as marcações de priority-next.
    /// Retorna quantas faixas foram removidas.
    pub fn truncate_after_current(&mut self) -> usize {
        let Some(current_idx) = self.current_index else {
            return 0;
        };

        let total = self.playback_items.len();
        if current_idx + 1 >= total {
            return 0;
        }

        let removed_entries: Vec<QueueEntry> =
            self.playback_items.drain(current_idx + 1..).collect();
        let removed_ids: HashSet<u64> =
            removed_entries.iter().map(|e| e.item_id).collect();

        self.source_items
            .retain(|e| !removed_ids.contains(&e.item_id));
        self.queued_next_item_ids
            .retain(|id| !removed_ids.contains(id));

        let removed = removed_entries.len();
        removed
    }

    /// Anexa track_ids ao fim da playback_items (após posição atual) e também
    /// ao source_items. Usado para continuation de rádio e para a segunda metade
    /// do re-roll. Retorna a quantidade anexada.
    pub fn append_radio_batch(&mut self, track_ids: &[String]) -> usize {
        for video_id in track_ids {
            let item_id = self.alloc_item_id();
            let entry = QueueEntry {
                item_id,
                video_id: video_id.clone(),
            };
            self.source_items.push(entry.clone());
            self.playback_items.push(entry);
        }

        if self.current_index.is_none() && !self.playback_items.is_empty() {
            self.current_index = Some(0);
        }
        track_ids.len()
    }

    pub fn current_track_id(&self) -> Option<String> {
        self.current_index
            .and_then(|index| self.playback_items.get(index))
            .map(|entry| entry.video_id.clone())
    }

    fn current_item_id(&self) -> Option<u64> {
        self.current_index
            .and_then(|index| self.playback_items.get(index))
            .map(|entry| entry.item_id)
    }

    fn rebuild_playback(&mut self, start_index: usize) {
        self.playback_items.clear();

        if self.source_items.is_empty() {
            self.current_index = None;
            return;
        }

        let safe_start = start_index.min(self.source_items.len().saturating_sub(1));
        let current_item_id = self.source_items[safe_start].item_id;

        if self.shuffle {
            self.rebuild_shuffled_with_prefix(current_item_id, &[]);
        } else {
            self.playback_items = self.source_items.clone();
            self.current_index = Some(safe_start);
        }
    }

    fn restart_shuffled_cycle(&mut self) {
        if self.source_items.is_empty() {
            self.playback_items.clear();
            self.current_index = None;
            self.history_item_ids.clear();
            return;
        }

        self.history_item_ids.clear();

        let start_index = self.random_inclusive(0, self.source_items.len().saturating_sub(1));
        let current_item_id = self.source_items[start_index].item_id;
        self.rebuild_shuffled_with_prefix(current_item_id, &[]);
    }

    fn rebuild_shuffled_with_prefix(&mut self, current_item_id: u64, played_prefix_ids: &[u64]) {
        let mut used = HashSet::new();

        let played_prefix = self.entries_for_item_ids(played_prefix_ids, &mut used);

        let Some(current_entry) = self
            .source_items
            .iter()
            .find(|entry| entry.item_id == current_item_id)
            .cloned()
        else {
            self.playback_items = self.source_items.clone();
            self.current_index = Some(0);
            return;
        };

        used.insert(current_item_id);

        let queued_next = self.entries_for_item_ids(&self.queued_next_item_ids, &mut used);
        let mut remaining = self
            .source_items
            .iter()
            .filter(|entry| !used.contains(&entry.item_id))
            .cloned()
            .collect::<Vec<_>>();

        shuffle_entries(&mut remaining, &mut self.rng_state);

        self.playback_items = played_prefix;
        self.current_index = Some(self.playback_items.len());
        self.playback_items.push(current_entry);
        self.playback_items.extend(queued_next);
        self.playback_items.extend(remaining);
        self.prune_state();
    }

    fn entries_for_item_ids(
        &self,
        item_ids: &[u64],
        used: &mut HashSet<u64>,
    ) -> Vec<QueueEntry> {
        let mut entries = Vec::new();

        for item_id in item_ids {
            if used.contains(item_id) {
                continue;
            }

            if let Some(entry) = self
                .source_items
                .iter()
                .find(|entry| entry.item_id == *item_id)
                .cloned()
            {
                used.insert(*item_id);
                entries.push(entry);
            }
        }

        entries
    }

    fn insert_shuffled_future_entry(&mut self, entry: QueueEntry) {
        if self.playback_items.is_empty() {
            self.playback_items.push(entry);
            self.current_index = Some(0);
            return;
        }

        let min_insert_index = self
            .current_index
            .map(|index| index + 1 + self.queued_next_item_ids.len())
            .unwrap_or(self.queued_next_item_ids.len())
            .min(self.playback_items.len());
        let insert_at = self.random_inclusive(min_insert_index, self.playback_items.len());
        self.playback_items.insert(insert_at, entry);
    }

    fn insert_entry_next(&mut self, entry: QueueEntry) {
        let source_insert_at = self
            .current_item_id()
            .and_then(|current_item_id| self.find_source_index(current_item_id))
            .map(|index| index + 1 + self.queued_next_item_ids.len())
            .unwrap_or(self.source_items.len());

        self.source_items
            .insert(source_insert_at.min(self.source_items.len()), entry.clone());

        self.queued_next_item_ids.push(entry.item_id);

        if self.playback_items.is_empty() {
            self.playback_items.push(entry.clone());
            self.current_index = Some(0);
            self.queued_next_item_ids.clear();
        } else {
            let playback_insert_at = self
                .current_index
                .map(|index| index + self.queued_next_item_ids.len())
                .unwrap_or(self.playback_items.len());
            self.playback_items
                .insert(playback_insert_at.min(self.playback_items.len()), entry);
        }

        self.prune_state();
    }

    fn insert_collection_next(&mut self, entries: Vec<QueueEntry>) {
        if entries.is_empty() {
            return;
        }

        if self.playback_items.is_empty() {
            self.source_items.extend(entries.iter().cloned());
            self.playback_items.extend(entries);
            self.current_index = Some(0);
            self.queued_next_item_ids.clear();
            self.prune_state();
            return;
        }

        let source_insert_at = self
            .current_item_id()
            .and_then(|current_item_id| self.find_source_index(current_item_id))
            .map(|index| index + 1)
            .unwrap_or(self.source_items.len());

        let playback_insert_at = self.current_index.map(|index| index + 1).unwrap_or(0);

        for (offset, entry) in entries.iter().cloned().enumerate() {
            self.source_items
                .insert((source_insert_at + offset).min(self.source_items.len()), entry.clone());
            self.playback_items.insert(
                (playback_insert_at + offset).min(self.playback_items.len()),
                entry,
            );
        }

        let new_item_ids = entries.iter().map(|entry| entry.item_id).collect::<Vec<_>>();
        self.queued_next_item_ids.splice(0..0, new_item_ids);
        self.prune_state();
    }

    fn detach_from_playlist(&mut self) {
        self.playlist_id = None;
        self.is_complete = true;
    }

    fn move_to_index(&mut self, index: usize, push_history: bool) {
        if index >= self.playback_items.len() {
            return;
        }

        let target_item_id = self.playback_items[index].item_id;

        if push_history {
            if let Some(current_item_id) = self.current_item_id() {
                if current_item_id != target_item_id {
                    self.history_item_ids.push(current_item_id);
                }
            }
        }

        self.current_index = Some(index);
        self.queued_next_item_ids
            .retain(|item_id| *item_id != target_item_id);
        self.prune_state();
    }

    fn find_playback_index(&self, item_id: u64) -> Option<usize> {
        self.playback_items
            .iter()
            .position(|entry| entry.item_id == item_id)
    }

    fn find_source_index(&self, item_id: u64) -> Option<usize> {
        self.source_items
            .iter()
            .position(|entry| entry.item_id == item_id)
    }

    fn alloc_item_id(&mut self) -> u64 {
        self.next_item_id += 1;
        self.next_item_id
    }

    fn reset_rng_state(&mut self) {
        let seed = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_nanos() as u64)
            .unwrap_or(0x9E37_79B9_7F4A_7C15)
            ^ self.next_item_id.rotate_left(17)
            ^ (self.source_items.len() as u64).rotate_left(9)
            ^ 0xA5A5_5A5A_1234_5678;

        self.rng_state = if seed == 0 { 0xD1B5_4A32_1F27_9C65 } else { seed };
    }

    fn random_inclusive(&mut self, min: usize, max: usize) -> usize {
        if max <= min {
            return min;
        }

        let span = (max - min) + 1;
        min + (self.next_random_u64() as usize % span)
    }

    fn next_random_u64(&mut self) -> u64 {
        if self.rng_state == 0 {
            self.reset_rng_state();
        }

        let mut value = self.rng_state;
        value ^= value >> 12;
        value ^= value << 25;
        value ^= value >> 27;
        self.rng_state = value;
        value.wrapping_mul(0x2545_F491_4F6C_DD1D)
    }

    fn prune_state(&mut self) {
        let valid_ids = self
            .source_items
            .iter()
            .map(|entry| entry.item_id)
            .collect::<HashSet<_>>();

        self.history_item_ids.retain(|item_id| valid_ids.contains(item_id));
        self.queued_next_item_ids
            .retain(|item_id| valid_ids.contains(item_id));

        if let Some(current_item_id) = self.current_item_id() {
            self.history_item_ids.retain(|item_id| *item_id != current_item_id);
            self.queued_next_item_ids
                .retain(|item_id| *item_id != current_item_id);
        }
    }

}

fn shuffle_entries(entries: &mut [QueueEntry], rng_state: &mut u64) {
    if entries.len() < 2 {
        return;
    }

    for index in (1..entries.len()).rev() {
        let swap_index = random_inclusive(rng_state, 0, index);
        entries.swap(index, swap_index);
    }
}

fn random_inclusive(rng_state: &mut u64, min: usize, max: usize) -> usize {
    if max <= min {
        return min;
    }

    let span = (max - min) + 1;
    min + (next_random_u64(rng_state) as usize % span)
}

fn next_random_u64(rng_state: &mut u64) -> u64 {
    if *rng_state == 0 {
        *rng_state = 0xD1B5_4A32_1F27_9C65;
    }

    let mut value = *rng_state;
    value ^= value >> 12;
    value ^= value << 25;
    value ^= value >> 27;
    *rng_state = value;
    value.wrapping_mul(0x2545_F491_4F6C_DD1D)
}

#[cfg(test)]
mod tests {
    use super::{PlaybackQueue, RadioSeed, RadioSeedKind, RadioState};

    fn track_ids(queue: &PlaybackQueue) -> Vec<&str> {
        queue
            .playback_items
            .iter()
            .map(|entry| entry.video_id.as_str())
            .collect()
    }

    #[test]
    fn shuffle_preserves_current_track() {
        let mut queue = PlaybackQueue::default();
        queue.set_queue(
            vec!["a".into(), "b".into(), "c".into(), "d".into()],
            2,
            None,
            true,
            false,
        );

        let before = queue.current_track_id();
        queue.toggle_shuffle();

        assert_eq!(queue.current_track_id(), before);
        assert_eq!(queue.current_index, Some(2));
    }

    #[test]
    fn previous_in_shuffle_uses_history() {
        let mut queue = PlaybackQueue::default();
        queue.set_queue(
            vec!["a".into(), "b".into(), "c".into(), "d".into()],
            0,
            None,
            true,
            true,
        );

        let first = queue.current_track_id().unwrap();
        let second = queue.next_track().track_id.unwrap();
        let third = queue.next_track().track_id.unwrap();

        assert_ne!(first, second);
        assert_ne!(second, third);

        let previous = queue.previous_track().track_id.unwrap();
        assert_eq!(previous, second);
    }

    #[test]
    fn repeat_one_returns_same_track_on_end() {
        let mut queue = PlaybackQueue::default();
        queue.set_queue(vec!["a".into(), "b".into()], 0, None, true, false);
        queue.cycle_repeat();
        queue.cycle_repeat();

        let response = queue.handle_track_end();
        assert_eq!(response.track_id.as_deref(), Some("a"));
        assert_eq!(queue.current_index, Some(0));
    }

    #[test]
    fn add_next_preserves_insertion_order() {
        let mut queue = PlaybackQueue::default();
        queue.set_queue(vec!["a".into(), "b".into(), "c".into()], 0, None, true, true);

        queue.add_next("x".into());
        queue.add_next("y".into());

        let ids = track_ids(&queue);
        assert_eq!(ids[0], "a");
        assert_eq!(ids[1], "x");
        assert_eq!(ids[2], "y");
    }

    #[test]
    fn previous_wraps_on_repeat_all() {
        let mut queue = PlaybackQueue::default();
        queue.set_queue(vec!["a".into(), "b".into(), "c".into()], 0, None, true, false);
        queue.cycle_repeat();

        let response = queue.previous_track();
        assert_eq!(response.track_id.as_deref(), Some("c"));
        assert_eq!(queue.current_index, Some(2));
    }

    #[test]
    fn add_collection_next_preserves_priority_after_shuffle_toggle() {
        let mut queue = PlaybackQueue::default();
        queue.set_queue(
            vec!["a".into(), "b".into(), "c".into(), "d".into()],
            0,
            Some("p".into()),
            true,
            false,
        );

        queue.add_collection_next(vec!["x".into(), "y".into()]);
        queue.toggle_shuffle();

        let ids = track_ids(&queue);
        assert_eq!(ids[0], "a");
        assert_eq!(ids[1], "x");
        assert_eq!(ids[2], "y");
        assert_eq!(queue.playlist_id, None);
        assert!(queue.is_complete);
    }

    #[test]
    fn latest_add_collection_next_takes_priority_over_existing_priority_block() {
        let mut queue = PlaybackQueue::default();
        queue.set_queue(vec!["a".into(), "b".into(), "c".into()], 0, None, true, false);

        queue.add_collection_next(vec!["x".into(), "y".into()]);
        queue.add_collection_next(vec!["m".into(), "n".into()]);

        let ids = track_ids(&queue);
        assert_eq!(ids[0], "a");
        assert_eq!(ids[1], "m");
        assert_eq!(ids[2], "n");
        assert_eq!(ids[3], "x");
        assert_eq!(ids[4], "y");
    }

    #[test]
    fn append_collection_is_regular_future_when_shuffle_is_enabled() {
        let mut queue = PlaybackQueue::default();
        queue.set_queue(
            vec!["a".into(), "b".into(), "c".into(), "d".into()],
            0,
            Some("p".into()),
            true,
            false,
        );

        queue.add_collection_next(vec!["x".into()]);
        queue.append_collection(vec!["y".into(), "z".into()]);
        queue.toggle_shuffle();

        let ids = track_ids(&queue);
        assert_eq!(ids[0], "a");
        assert_eq!(ids[1], "x");
        assert!(ids[2..].contains(&"y"));
        assert!(ids[2..].contains(&"z"));
        assert_eq!(queue.playlist_id, None);
        assert!(queue.is_complete);
    }

    #[test]
    fn truncate_after_current_preserves_current_and_history() {
        let mut queue = PlaybackQueue::default();
        queue.set_queue(
            vec!["a".into(), "b".into(), "c".into(), "d".into(), "e".into()],
            0,
            None,
            false,
            false,
        );
        queue.play_index(2);
        let removed = queue.truncate_after_current();
        assert_eq!(removed, 2);
        assert_eq!(queue.playback_items.len(), 3);
        assert_eq!(queue.current_index, Some(2));
        assert_eq!(queue.current_track_id().as_deref(), Some("c"));
    }

    #[test]
    fn append_radio_batch_grows_queue() {
        let mut queue = PlaybackQueue::default();
        queue.set_queue(vec!["a".into()], 0, None, false, false);
        let added = queue.append_radio_batch(&["b".to_string(), "c".to_string()]);
        assert_eq!(added, 2);
        assert_eq!(queue.playback_items.len(), 3);
        assert_eq!(queue.remaining_after_current(), 2);
    }

    #[test]
    fn set_queue_clears_radio_state() {
        let mut queue = PlaybackQueue::default();
        queue.set_radio_state(RadioState {
            seed: RadioSeed {
                kind: RadioSeedKind::Video,
                id: "x".into(),
            },
            continuation: Some("tok".into()),
            pool_exhausted: false,
            loaded_count: 10,
            fetching: false,
        });
        assert!(queue.radio_state().is_some());
        queue.set_queue(vec!["a".into()], 0, None, true, false);
        assert!(queue.radio_state().is_none());
    }
}
