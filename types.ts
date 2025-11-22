export interface Chapter {
  id: string;
  title: string;
  content: string; // Full raw content
  segments: string[]; // Content split by sentence/paragraph for TTS
}

export interface Book {
  filename: string;
  chapters: Chapter[];
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
