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
    history_item_ids: Vec<u64>,
    queued_next_item_ids: Vec<u64>,
    rng_state: u64,
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
        self.history_item_ids.clear();
        self.queued_next_item_ids.clear();
        self.playlist_id = playlist_id;
        self.is_complete = is_complete;
        self.shuffle = shuffle;
        self.reset_rng_state();

        for video_id in track_ids {
            let item_id = self.alloc_item_id();
            self.source_items.push(QueueEntry { item_id, video_id });
        }

        self.rebuild_playback(start_index);
        self.log_state("set_queue");

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
            println!(
                "[PlaybackQueue] append_playlist_batch playlist_id={} added={} is_complete={} summary={}",
                playlist_id,
                new_ids.len(),
                is_complete,
                self.debug_summary()
            );
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
            let from = self.current_index;
            self.move_to_index(index, true);
            println!(
                "[PlaybackQueue] play_index from={:?} to={} current_item={:?} summary={}",
                from,
                index,
                self.current_track_id(),
                self.debug_summary()
            );
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
            self.log_state("next_track_init");
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
            let from = self.current_index;
            self.move_to_index(next_index, true);
            println!(
                "[PlaybackQueue] next_track from={:?} to={} track_id={:?} summary={}",
                from,
                next_index,
                self.current_track_id(),
                self.debug_summary()
            );
            return QueueCommandResponse {
                track_id: self.current_track_id(),
                snapshot: self.snapshot(),
            };
        }

        if self.repeat == RepeatMode::All && !self.playback_items.is_empty() {
            if self.shuffle {
                self.restart_shuffled_cycle();
                println!(
                    "[PlaybackQueue] next_track reshuffle_cycle track_id={:?} summary={} upcoming={}",
                    self.current_track_id(),
                    self.debug_summary(),
                    self.debug_upcoming()
                );
            } else {
                let from = self.current_index;
                self.move_to_index(0, true);
                println!(
                    "[PlaybackQueue] next_track wrap_linear from={:?} to=0 track_id={:?} summary={}",
                    from,
                    self.current_track_id(),
                    self.debug_summary()
                );
            }

            return QueueCommandResponse {
                track_id: self.current_track_id(),
                snapshot: self.snapshot(),
            };
        }

        println!(
            "[PlaybackQueue] next_track at_end repeat={} summary={}",
            self.repeat.as_str(),
            self.debug_summary()
        );

        QueueCommandResponse {
            track_id: None,
            snapshot: self.snapshot(),
        }
    }

    pub fn previous_track(&mut self) -> QueueCommandResponse {
        if self.playback_items.is_empty() {
            self.log_state("previous_track_empty");
            return QueueCommandResponse {
                track_id: None,
                snapshot: self.snapshot(),
            };
        }

        if self.shuffle {
            while let Some(previous_item_id) = self.history_item_ids.pop() {
                if let Some(previous_index) = self.find_playback_index(previous_item_id) {
                    let from = self.current_index;
                    self.move_to_index(previous_index, false);
                    println!(
                        "[PlaybackQueue] previous_track shuffle_history from={:?} to={} item_id={} track_id={:?} summary={}",
                        from,
                        previous_index,
                        previous_item_id,
                        self.current_track_id(),
                        self.debug_summary()
                    );
                    return QueueCommandResponse {
                        track_id: self.current_track_id(),
                        snapshot: self.snapshot(),
                    };
                }
            }

            if self.repeat == RepeatMode::All {
                let from = self.current_index;
                self.move_to_index(self.playback_items.len().saturating_sub(1), false);
                println!(
                    "[PlaybackQueue] previous_track shuffle_wrap from={:?} to={} track_id={:?} summary={}",
                    from,
                    self.current_index.unwrap_or_default(),
                    self.current_track_id(),
                    self.debug_summary()
                );
                return QueueCommandResponse {
                    track_id: self.current_track_id(),
                    snapshot: self.snapshot(),
                };
            }
        } else if let Some(current_index) = self.current_index {
            if current_index > 0 {
                let from = self.current_index;
                self.move_to_index(current_index - 1, false);
                println!(
                    "[PlaybackQueue] previous_track linear from={:?} to={} track_id={:?} summary={}",
                    from,
                    current_index - 1,
                    self.current_track_id(),
                    self.debug_summary()
                );
                return QueueCommandResponse {
                    track_id: self.current_track_id(),
                    snapshot: self.snapshot(),
                };
            }

            if self.repeat == RepeatMode::All {
                let from = self.current_index;
                self.move_to_index(self.playback_items.len().saturating_sub(1), false);
                println!(
                    "[PlaybackQueue] previous_track linear_wrap from={:?} to={} track_id={:?} summary={}",
                    from,
                    self.current_index.unwrap_or_default(),
                    self.current_track_id(),
                    self.debug_summary()
                );
                return QueueCommandResponse {
                    track_id: self.current_track_id(),
                    snapshot: self.snapshot(),
                };
            }
        }

        println!(
            "[PlaybackQueue] previous_track no_move repeat={} shuffle={} summary={}",
            self.repeat.as_str(),
            self.shuffle,
            self.debug_summary()
        );

        QueueCommandResponse {
            track_id: self.current_track_id(),
            snapshot: self.snapshot(),
        }
    }

    pub fn handle_track_end(&mut self) -> QueueCommandResponse {
        if self.repeat == RepeatMode::One {
            println!(
                "[PlaybackQueue] handle_track_end repeat_one track_id={:?} summary={}",
                self.current_track_id(),
                self.debug_summary()
            );
            return QueueCommandResponse {
                track_id: self.current_track_id(),
                snapshot: self.snapshot(),
            };
        }

        println!(
            "[PlaybackQueue] handle_track_end repeat={} summary={}",
            self.repeat.as_str(),
            self.debug_summary()
        );

        self.next_track()
    }

    pub fn add_next(&mut self, video_id: String) -> QueueCommandResponse {
        let entry = QueueEntry {
            item_id: self.alloc_item_id(),
            video_id,
        };

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

        println!(
            "[PlaybackQueue] add_next summary={} upcoming={}",
            self.debug_summary(),
            self.debug_upcoming()
        );

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
        println!(
            "[PlaybackQueue] remove_index index={} current_track={:?} summary={}",
            index,
            self.current_track_id(),
            self.debug_summary()
        );

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

        println!(
            "[PlaybackQueue] toggle_shuffle shuffle={} current_track={:?} history_len={} upcoming={}",
            self.shuffle,
            self.current_track_id(),
            self.history_item_ids.len(),
            self.debug_upcoming()
        );

        QueueCommandResponse {
            track_id: self.current_track_id(),
            snapshot: self.snapshot(),
        }
    }

    pub fn cycle_repeat(&mut self) -> QueueCommandResponse {
        self.repeat = self.repeat.cycle();
        println!(
            "[PlaybackQueue] cycle_repeat repeat={} summary={}",
            self.repeat.as_str(),
            self.debug_summary()
        );
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
        self.log_state("clear");

        QueueCommandResponse {
            track_id: None,
            snapshot: self.snapshot(),
        }
    }

    fn current_track_id(&self) -> Option<String> {
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

    fn log_state(&self, action: &str) {
        println!("[PlaybackQueue] {} summary={}", action, self.debug_summary());
    }

    fn debug_summary(&self) -> String {
        format!(
            "current_index={:?} current_track={:?} total={} shuffle={} repeat={} history_len={} queued_next_len={}",
            self.current_index,
            self.current_track_id(),
            self.playback_items.len(),
            self.shuffle,
            self.repeat.as_str(),
            self.history_item_ids.len(),
            self.queued_next_item_ids.len()
        )
    }

    fn debug_upcoming(&self) -> String {
        let start = self.current_index.map(|index| index + 1).unwrap_or(0);
        let ids = self
            .playback_items
            .iter()
            .skip(start)
            .take(5)
            .map(|entry| entry.video_id.as_str())
            .collect::<Vec<_>>();
        serde_json::to_string(&ids).unwrap_or_else(|_| "[]".to_string())
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
    use super::PlaybackQueue;

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
}
