// @vitest-environment node
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { bookshelf, listBooks, loadBook, saveBook, saveProgress, deleteBook } from '../utils/bookshelf';
import { parseBookContent } from '../utils/parser';

beforeEach(async () => { await bookshelf.books.clear(); });

describe('persistent bookshelf', () => {
  it('opens the old online TXT record shape without migration or deletion', async () => {
    await bookshelf.books.add({ id: 42, title: '旧书.txt', content: '第一章 开始\n第一段\n第二段',
      lastReadTime: 100, progress: { chapterIndex: 1, segmentIndex: 1, scrollTop: 123 } });
    const { book, progress } = await loadBook(42);
    expect(book.chapters[1].segments).toEqual(['第一段', '第二段']);
    expect(progress).toEqual({ chapterIndex: 1, segmentIndex: 1, scrollTop: 123 });
    expect((await bookshelf.books.get(42))?.content).toContain('第一段');
  });
  it('stores source bytes and changes progress without overwriting the file', async () => {
    const text = '第一章 开始\n持久化正文';
    const bytes = new TextEncoder().encode(text).buffer;
    const file = new File([text], '新书.txt');
    const id = await saveBook(file, bytes, parseBookContent(file.name, text));
    bookshelf.close();
    await bookshelf.open();
    await saveProgress(id, { chapterIndex: 1, segmentIndex: 0, scrollTop: 200 });
    expect((await loadBook(id)).book.chapters[1].segments).toEqual(['持久化正文']);
    expect((await loadBook(id)).progress?.scrollTop).toBe(200);
    const entries = await listBooks();
    expect(entries).toHaveLength(1);
    expect(entries[0]).not.toHaveProperty('data');
  });
  it('never removes an unreadable cached record', async () => {
    await bookshelf.books.add({ id: 7, title: '损坏记录', lastReadTime: 1 });
    await expect(loadBook(7)).rejects.toThrow('缺少');
    expect(await bookshelf.books.get(7)).toBeDefined();
  });
  it('only deletes the chosen book and late progress saves cannot recreate it', async () => {
    await bookshelf.books.bulkAdd([
      { id: 1, title: '保留', content: '正文', lastReadTime: 1 },
      { id: 2, title: '删除', content: '正文', lastReadTime: 2 },
    ]);
    await deleteBook(2);
    await saveProgress(2, { chapterIndex: 0, segmentIndex: 0, scrollTop: 0 });
    expect((await listBooks()).map(entry => entry.id)).toEqual([1]);
  });
});
