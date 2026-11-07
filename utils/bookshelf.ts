import Dexie, { type Table } from 'dexie';
import { Book } from '../types';
import { parseEpub } from './epub';
import { parseBookContent } from './parser';
import { findLibraryBook, parseLibraryText } from './library';

export interface ReadingProgress {
  chapterIndex: number;
  segmentIndex: number;
  scrollTop: number;
}
export interface StoredBook {
  id?: number;
  title: string;
  filename?: string;
  format?: 'txt' | 'epub';
  catalogId?: string;
  data?: ArrayBuffer;
  content?: string; // Original online bookshelf stored decoded TXT in this field.
  lastReadTime: number;
  progress?: ReadingProgress;
}
export type ShelfEntry = Pick<StoredBook, 'id' | 'title' | 'format' | 'lastReadTime' | 'progress' | 'catalogId'>;

// Keep the old online database name AND schema version. Never clear or rebuild it.
class Bookshelf extends Dexie {
  books!: Table<StoredBook, number>;
  constructor() {
    super('zenreader-bookshelf');
    this.version(1).stores({ books: '++id,lastReadTime,title' });
  }
}
export const bookshelf = new Bookshelf();

export async function listBooks(): Promise<ShelfEntry[]> {
  const records = await bookshelf.books.orderBy('lastReadTime').reverse().toArray();
  return records.map(({ id, title, format, lastReadTime, progress, catalogId }) =>
    ({ id, title, format, lastReadTime, progress, catalogId }));
}

export async function saveBook(file: File, data: ArrayBuffer, book: Book): Promise<number> {
  return bookshelf.books.add({
    title: book.title || file.name,
    filename: file.name,
    format: file.name.toLowerCase().endsWith('.epub') ? 'epub' : 'txt',
    data,
    catalogId: book.catalogId,
    lastReadTime: Date.now(),
    progress: { chapterIndex: 0, segmentIndex: 0, scrollTop: 0 },
  });
}

export async function loadBook(id: number): Promise<{ book: Book; progress?: ReadingProgress }> {
  const record = await bookshelf.books.get(id);
  if (!record) throw new Error('找不到这本书，请刷新书架');
  const filename = record.filename || record.title;
  let book: Book;
  if (record.format === 'epub' && record.data) {
    // Recreate image object URLs each time; persisted blob: URLs cannot survive a reload.
    book = await parseEpub(filename, record.data);
  } else if (typeof record.content === 'string') {
    book = parseBookContent(filename, record.content);
  } else if (record.data) {
    let text = new TextDecoder('utf-8').decode(record.data);
    if (text.includes('\uFFFD')) text = new TextDecoder('gb18030').decode(record.data);
    const entry = record.catalogId ? findLibraryBook(record.catalogId) : undefined;
    book = entry ? parseLibraryText(entry, text) : parseBookContent(filename, text);
  } else {
    throw new Error('这条缓存缺少书籍内容，请重新导入；原记录仍保留在书架');
  }
  return { book, progress: record.progress };
}

export async function saveProgress(id: number, progress: ReadingProgress): Promise<void> {
  // update() preserves the file and all legacy fields, and never recreates deleted records.
  await bookshelf.books.update(id, { progress, lastReadTime: Date.now() });
}
export const deleteBook = (id: number) => bookshelf.books.delete(id);
