import type { Track } from "../types/music";
import type {
  CollectionWindowItem,
  TrackCollectionSnapshotInput,
  TrackCollectionType,
} from "./yt-api";
import {
  ytCacheCollectionSnapshot,
  ytGetCollectionTrackIds,
  ytGetCollectionWindow,
} from "./yt-api";

export type TrackCollectionEntry = Track & {
  collectionPosition: number;
  collectionRowKey: string;
};

export function createTrackCollectionId(...parts: Array<string | number>): string {
  return parts
    .map((part) => String(part).trim())
    .filter(Boolean)
    .join(":");
}

export function toTrackCollectionEntry(
  collectionType: TrackCollectionType,
  collectionId: string,
  track: Track,
  position: number
): TrackCollectionEntry {
  return {
    ...track,
    collectionPosition: position,
    collectionRowKey: `${collectionType}:${collectionId}:${position}`,
  };
}

export function fromCollectionWindowItem(
  collectionType: TrackCollectionType,
  collectionId: string,
  item: CollectionWindowItem
): TrackCollectionEntry {
  return toTrackCollectionEntry(collectionType, collectionId, item, item.position);
}

export async function cacheFiniteTrackCollection(
  snapshot: TrackCollectionSnapshotInput
): Promise<{
  entries: TrackCollectionEntry[];
  trackIds: string[];
  isComplete: boolean;
}> {
  await ytCacheCollectionSnapshot(snapshot);
  const [window, trackIds] = await Promise.all([
    ytGetCollectionWindow(
      snapshot.collectionType,
      snapshot.collectionId,
      0,
      Math.max(snapshot.tracks.length, 1)
    ),
    ytGetCollectionTrackIds(snapshot.collectionType, snapshot.collectionId),
  ]);

  return {
    entries: window.items.map((item) =>
      fromCollectionWindowItem(
        snapshot.collectionType,
        snapshot.collectionId,
        item
      )
    ),
    trackIds: trackIds.trackIds,
    isComplete: trackIds.isComplete,
  };
}
