import { Chapter, Book } from '../types';

// Regex to identify chapter titles.
// Matches lines starting with optional whitespace, then "第", characters, then "章" or "卷".
// Examples: "第1章", "第一卷", "第十章 storm"
const CHAPTER_REGEX = /^\s*(第[0-9零一二三四五六七八九十百千万]+[卷章].*)$/;

export const parseBookContent = (filename: string, text: string): Book => {
  const lines = text.split(/\r?\n/);
  const chapters: Chapter[] = [];
  
  let currentTitle = "序章 / 开始";
  let currentLines: string[] = [];

  // Helper to push a finished chapter
  const addChapter = (title: string, rawLines: string[]) => {
    const content = rawLines.join('\n').trim();
    if (content.length > 0 || chapters.length === 0) {
      // Split content into segments (sentences/paragraphs) for smoother TTS highlighting
      // We split by common sentence delimiters but keep them attached or split by newlines
      // For simplicity and better reading flow, we split by non-empty lines (paragraphs).
      const segments = content
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);

      chapters.push({
        id: `chap-${chapters.length}`,
        title,
        content,
        segments: segments.length > 0 ? segments : ["(本章为空)"]
      });
    }
  };

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (CHAPTER_REGEX.test(trimmedLine)) {
      // Found a new chapter, save the previous one
      addChapter(currentTitle, currentLines);
      
      // Start new chapter
      currentTitle = trimmedLine;
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  // Add the final chapter
  addChapter(currentTitle, currentLines);

  return {
    filename,
    chapters,
  };
};
