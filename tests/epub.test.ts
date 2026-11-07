// @vitest-environment jsdom
import JSZip from 'jszip';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseEpub } from '../utils/epub';
import { parseBookContent } from '../utils/parser';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
async function fixture(version: 2 | 3 = 3, broken = false) {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip');
  zip.file('META-INF/container.xml', '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OPS/package.opf"/></rootfiles></container>');
  zip.file('OPS/package.opf', `<package xmlns="http://www.idpf.org/2007/opf" xmlns:dc="http://purl.org/dc/elements/1.1/" version="${version}.0"><metadata><dc:title>插图测试书</dc:title></metadata><manifest>
    <item id="ch2" href="Text/two.xhtml" media-type="application/xhtml+xml"/>
    <item id="cover" href="Text/cover.xhtml" media-type="application/xhtml+xml"/>
    <item id="ch1" href="Text/one.xhtml" media-type="application/xhtml+xml"/>
    <item id="image" href="Images/pic%20one.png" media-type="image/png"/>
    ${version === 3 ? '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>' : '<item id="toc" href="toc.ncx" media-type="application/x-dtbncx+xml"/>'}
    </manifest><spine toc="toc"><itemref idref="cover"/><itemref idref="ch1"/><itemref idref="ch2"/></spine></package>`);
  zip.file('OPS/nav.xhtml', '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><a href="Text/one.xhtml#start">第一章 目录标题</a><a href="Text/two.xhtml">第二章</a></nav></body></html>');
  zip.file('OPS/toc.ncx', '<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/"><navMap><navPoint><navLabel><text>第一章 目录标题</text></navLabel><content src="Text/one.xhtml#start"/></navPoint><navPoint><navLabel><text>第二章</text></navLabel><content src="Text/two.xhtml"/></navPoint></navMap></ncx>');
  zip.file('OPS/Text/cover.xhtml', '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>封面</title></head><body><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><image xlink:href="../Images/pic%20one.png"/></svg></body></html>');
  zip.file('OPS/Text/one.xhtml', '<html xmlns="http://www.w3.org/1999/xhtml"><head><style>body {color: red}</style></head><body><h1>第一章</h1><p>图片之前。<em>保留内联文字。</em></p><img src="../Images/pic%20one.png" alt="章节插图"/><p>图片之后。</p><script>alert("不运行")</script><p hidden="hidden">隐藏文字</p><img src="https://example.com/tracker.png" alt="外部图片"/></body></html>');
  zip.file('OPS/Text/two.xhtml', broken ? '<not-valid' : '<html xmlns="http://www.w3.org/1999/xhtml"><body><p>最后一段。</p></body></html>');
  zip.file('OPS/Images/pic one.png', png, { base64: true });
  return zip.generateAsync({ type: 'arraybuffer' });
}

beforeEach(() => {
  let count = 0;
  URL.createObjectURL = vi.fn(() => `blob:test-${++count}`);
  URL.revokeObjectURL = vi.fn();
});

describe('EPUB import', () => {
  it.each([2, 3] as const)('reads EPUB %s spine order, navigation, SVG cover and relative images', async version => {
    const book = await parseEpub('book.epub', await fixture(version));
    expect(book.title).toBe('插图测试书');
    expect(book.chapters.map(chapter => chapter.title)).toEqual(['封面', '第一章 目录标题', '第二章']);
    expect(book.chapters[0].segments).toEqual([]);
    expect(book.chapters[0].blocks).toEqual([{ type: 'image', src: 'blob:test-1', alt: '' }]);
    const chapter = book.chapters[1];
    expect(chapter.segments).toEqual(['第一章', '图片之前。保留内联文字。', '图片之后。']);
    expect(chapter.blocks?.map(block => block.type)).toEqual(['text', 'text', 'image', 'text', 'image']);
    expect(chapter.blocks?.[2]).toEqual({ type: 'image', src: 'blob:test-1', alt: '章节插图' });
    expect(chapter.blocks?.[4]).toEqual({ type: 'image', src: '', alt: '外部图片' });
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(book.objectUrls).toEqual(['blob:test-1']);
    expect(chapter.content).not.toContain('不运行');
  });
  it('releases previously extracted images if a later chapter is invalid', async () => {
    await expect(parseEpub('broken.epub', await fixture(3, true))).rejects.toThrow();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-1');
  });
  it('rejects invalid archives and missing EPUB package metadata', async () => {
    await expect(parseEpub('bad.epub', new ArrayBuffer(8))).rejects.toThrow();
    const zip = new JSZip();
    await expect(parseEpub('empty.epub', await zip.generateAsync({ type: 'arraybuffer' }))).rejects.toThrow('META-INF/container.xml');
  });
  it('keeps TXT chapter and paragraph parsing compatible', () => {
    const book = parseBookContent('test.txt', '第一章 开始\n第一段\n第二段\n第二章 继续\n第三段');
    expect(book.chapters.at(-1)?.segments).toEqual(['第三段']);
    expect(book.chapters.every(chapter => chapter.blocks === undefined)).toBe(true);
  });
});
