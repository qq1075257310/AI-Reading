import JSZip from 'jszip';
import { LIBRARY_BOOKS } from '../data/library';
import { Book, Chapter } from '../types';

export { LIBRARY_BOOKS };
export type LibraryBook = typeof LIBRARY_BOOKS[number];
export const findLibraryBook = (id: string) => LIBRARY_BOOKS.find(book => book.id === id);

export function localDayNumber(date = new Date()): number {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
}
export function recommendedBooks(language: 'zh' | 'en', day: number, batch = 0): LibraryBook[] {
  const pool = LIBRARY_BOOKS.filter(book => book.language === language);
  const start = ((day + batch * 3) % pool.length + pool.length) % pool.length;
  return Array.from({ length: Math.min(3, pool.length) }, (_, index) => pool[(start + index) % pool.length]);
}

export async function downloadLibraryFile(entry: LibraryBook): Promise<File> {
  const response = await fetch(entry.assetUrl);
  if (!response.ok) throw new Error('书籍下载失败，请稍后重试');
  const zip = await JSZip.loadAsync(await response.arrayBuffer());
  const body = zip.file('book.txt');
  if (!body) throw new Error('书籍内容不完整，请稍后重试');
  return new File([await body.async('uint8array') as BlobPart], entry.filename, { type: 'text/plain' });
}

// Keep this parser separate: existing user TXT bookmarks retain their old chapter numbering.
export function parseLibraryText(entry: LibraryBook, text: string): Book {
  const heading = entry.language === 'zh'
    ? /^(?:第[0-9〇零一二三四五六七八九十百千兩两]+[回章卷].*|卷[〇零一二三四五六七八九十百千]+|[\u3400-\u9fff]{1,8}第[〇零一二三四五六七八九十百千]+|〈[^〉]+〉)$/
    : /^(?:(?:CHAPTER|Chapter|LETTER|Letter)\s+(?:[0-9]+|[IVXLCDM]+)(?:[.:].*)?|STAVE\s+[IVX]+:.*|[IVX]+)$/;
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const chapters: Chapter[] = [];
  let title = entry.title as string;
  let content: string[] = [];
  const flush = () => {
    const raw = content.join('\n').trim();
    content = [];
    // Ignore contents lists and stray heading-only sections, not full narrative paragraphs.
    if (raw.length < (entry.language === 'en' ? 80 : 1)) return;
    const segments = raw.split(/\n\s*\n/).map(paragraph =>
      paragraph.replace(/\n/g, entry.language === 'en' ? ' ' : '').trim()).filter(Boolean);
    if (segments.length) chapters.push({ id: `library-${chapters.length}`, title, content: raw, segments });
  };
  for (const line of lines) {
    const trimmed = line.trim();
    if (heading.test(trimmed)) {
      flush();
      title = trimmed;
    } else {
      content.push(line);
    }
  }
  flush();
  if (!chapters.length) throw new Error('书籍没有可读取的正文');
  return { filename: entry.filename, title: entry.title, chapters, catalogId: entry.id };
}
