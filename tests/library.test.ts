import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { LIBRARY_BOOKS, localDayNumber, recommendedBooks, parseLibraryText } from '../utils/library';

describe('daily public-domain recommendations', () => {
  it('rotates predictably by day, allows another batch, and never mixes languages', () => {
    const first = recommendedBooks('zh', 100);
    expect(first).toHaveLength(3);
    expect(new Set(first.map(book => book.id)).size).toBe(3);
    expect(first.every(book => book.language === 'zh')).toBe(true);
    expect(recommendedBooks('zh', 100)).toEqual(first);
    expect(recommendedBooks('zh', 101)).not.toEqual(first);
    expect(recommendedBooks('zh', 100, 1).every(book => !first.includes(book))).toBe(true);
    expect(recommendedBooks('en', 100).every(book => book.language === 'en')).toBe(true);
  });
  it('uses a local calendar date and advances at midnight', () => {
    expect(localDayNumber(new Date(2026, 10, 9, 0, 0)) - localDayNumber(new Date(2026, 10, 8, 23, 59))).toBe(1);
  });
  it.each(LIBRARY_BOOKS)('loads complete packaged text with the recorded checksum: $title', async entry => {
    const bytes = readFileSync(`public${entry.assetUrl}`);
    expect(bytes.byteLength).toBe(entry.bytes);
    const zip = await JSZip.loadAsync(bytes);
    const text = await zip.file('book.txt')!.async('string');
    expect(createHash('sha256').update(text).digest('hex')).toBe(entry.sha256);
    expect(text).not.toMatch(/gutenberg/i);
    const book = parseLibraryText(entry, text);
    expect(book.catalogId).toBe(entry.id);
    expect(book.chapters.length).toBeGreaterThan(1);
    expect(book.chapters.every(chapter => chapter.segments.length > 0)).toBe(true);
  });
  it('preserves short classical chapters and all Alice chapters', async () => {
    for (const [id, expected] of [['pg-7337', 81], ['pg-11', 12]] as const) {
      const entry = LIBRARY_BOOKS.find(book => book.id === id)!;
      const zip = await JSZip.loadAsync(readFileSync(`public${entry.assetUrl}`));
      const book = parseLibraryText(entry, await zip.file('book.txt')!.async('string'));
      expect(book.chapters).toHaveLength(expected);
    }
  });
});
