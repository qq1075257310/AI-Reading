export type ReadingBlock =
  | { type: 'text'; segmentIndex: number }
  | { type: 'image'; src: string; alt: string };

export interface Chapter {
  id: string;
  title: string;
  content: string; // Full raw content
  segments: string[]; // Content split by sentence/paragraph for TTS
  blocks?: ReadingBlock[]; // EPUB text and illustrations in reading order
}

export interface Book {
  filename: string;
  chapters: Chapter[];
  title?: string;
  objectUrls?: string[]; // Released when the book is replaced or the reader unmounts
}

export interface TTSConfig {
  rate: number; // 0.5 to 2.0
  voiceURI: string | null;
  pitch: number;
  volume: number;
}

export enum ReaderTheme {
  LIGHT = 'light',
  SEPIA = 'sepia',
  DARK = 'dark',
}
