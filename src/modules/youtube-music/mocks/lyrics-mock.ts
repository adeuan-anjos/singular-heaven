// src/modules/youtube-music/mocks/lyrics-mock.ts
import type { LyricsData } from "../types/lyrics";

export const FALLBACK_COLORS: [string, string, string] = [
  "#1e293b",
  "#334155",
  "#475569",
];

const MOCK_SYNCED: LyricsData = {
  type: "synced",
  colors: ["#7c3aed", "#ec4899", "#f59e0b"],
  lines: [
    { time: 0, text: "When I find myself in times of trouble" },
    { time: 4, text: "Mother Mary comes to me" },
    { time: 8, text: "Speaking words of wisdom" },
    { time: 12, text: "Let it be" },
    { time: 18, text: "And in my hour of darkness" },
    { time: 22, text: "She is standing right in front of me" },
    { time: 26, text: "Speaking words of wisdom" },
    { time: 30, text: "Let it be" },
    { time: 36, text: "Let it be, let it be" },
    { time: 40, text: "Let it be, let it be" },
    { time: 44, text: "Whisper words of wisdom" },
    { time: 48, text: "Let it be" },
    { time: 56, text: "And when the broken-hearted people" },
    { time: 60, text: "Living in the world agree" },
    { time: 64, text: "There will be an answer" },
    { time: 68, text: "Let it be" },
    { time: 74, text: "For though they may be parted" },
    { time: 78, text: "There is still a chance that they will see" },
    { time: 82, text: "There will be an answer" },
    { time: 86, text: "Let it be" },
    { time: 92, text: "Let it be, let it be" },
    { time: 96, text: "Let it be, let it be" },
    { time: 100, text: "Yeah, there will be an answer" },
    { time: 104, text: "Let it be" },
  ],
};

const MOCK_ENHANCED: LyricsData = {
  type: "enhanced",
  colors: ["#0ea5e9", "#22d3ee", "#a78bfa"],
  lines: [
    {
      time: 0,
      text: "Hello darkness my old friend",
      words: [
        { time: 0, text: "Hello" },
        { time: 0.6, text: "darkness" },
        { time: 1.4, text: "my" },
        { time: 1.7, text: "old" },
        { time: 2.1, text: "friend" },
      ],
    },
    {
      time: 4,
      text: "I've come to talk with you again",
      words: [
        { time: 4, text: "I've" },
        { time: 4.3, text: "come" },
        { time: 4.7, text: "to" },
        { time: 4.9, text: "talk" },
        { time: 5.4, text: "with" },
        { time: 5.7, text: "you" },
        { time: 6.0, text: "again" },
      ],
    },
  ],
};

const MOCK_MISSING: LyricsData = {
  type: "missing",
  colors: FALLBACK_COLORS,
};

export const LYRICS_MOCKS: Record<string, LyricsData> = {
  "mock-synced": MOCK_SYNCED,
  "mock-enhanced": MOCK_ENHANCED,
  "mock-missing": MOCK_MISSING,
};

/**
 * Default mock used when we have no entry for a real videoId.
 * Lets us see the synced view for any track during the UI phase.
 */
export const DEFAULT_MOCK = MOCK_SYNCED;
