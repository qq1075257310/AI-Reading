import JSZip from 'jszip';
import { Book, Chapter, ReadingBlock } from '../types';

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_EXPANDED_SIZE = 150 * 1024 * 1024;
const BASE = 'https://epub.invalid/';
const elements = (root: Document | Element, name: string): Element[] =>
  Array.from(root.getElementsByTagNameNS('*', name));
const cleanText = (text: string) => text.replace(/\s+/g, ' ').trim();

// EPUB references are URLs relative to the containing document, not ZIP paths.
function resolvePath(from: string, href: string): string {
  const url = new URL(href, new URL(from, BASE));
  if (url.origin !== new URL(BASE).origin || !url.pathname.startsWith('/')) {
    throw new Error('不支持 EPUB 中的外部资源');
  }
  return decodeURIComponent(url.pathname.slice(1));
}

function xml(text: string): Document {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (elements(doc, 'parsererror').length) throw new Error('EPUB 文档格式不正确');
  return doc;
}

export async function parseEpub(filename: string, data: ArrayBuffer): Promise<Book> {
  if (data.byteLength > MAX_FILE_SIZE) throw new Error('EPUB 文件不能超过 50 MB');
  const objectUrls: string[] = [];
  try {
    const zip = await JSZip.loadAsync(data);
    if (Object.keys(zip.files).length > 10000) throw new Error('EPUB 文件数量过多');
    let expandedSize = 0;
    const readBytes = async (path: string) => {
      const file = zip.file(path);
      if (!file) throw new Error(`EPUB 缺少文件：${path}`);
      const bytes = await file.async('uint8array');
      expandedSize += bytes.byteLength;
      if (expandedSize > MAX_EXPANDED_SIZE) throw new Error('EPUB 解压后内容过大');
      return bytes;
    };
    const readText = async (path: string) => new TextDecoder().decode(await readBytes(path));
    const container = xml(await readText('META-INF/container.xml'));
    const rootfile = elements(container, 'rootfile')[0]?.getAttribute('full-path');
    if (!rootfile) throw new Error('找不到 EPUB 书籍信息');
    const opfPath = resolvePath('', rootfile);
    const opf = xml(await readText(opfPath));
    const manifest = new Map(elements(opf, 'item').map(item => [
      item.getAttribute('id') || '',
      {
        path: resolvePath(opfPath, item.getAttribute('href') || ''),
        mediaType: item.getAttribute('media-type') || '',
        properties: item.getAttribute('properties') || '',
      },
    ]));
    const labels = new Map<string, string>();
    const nav = Array.from(manifest.values()).find(item => item.properties.split(/\s+/).includes('nav'));
    const spine = elements(opf, 'spine')[0];
    const ncx = manifest.get(spine?.getAttribute('toc') || '') ||
      Array.from(manifest.values()).find(item => item.mediaType === 'application/x-dtbncx+xml');
    // Navigation labels are optional; heading/title still work without a TOC.
    if (nav) {
      const doc = xml(await readText(nav.path));
      const toc = elements(doc, 'nav').find(el =>
        (el.getAttribute('epub:type') || el.getAttributeNS('http://www.idpf.org/2007/ops', 'type') || '')
          .split(/\s+/).includes('toc'));
      for (const anchor of elements(toc || doc, 'a')) {
        const href = anchor.getAttribute('href');
        if (!href) continue;
        try {
          const path = resolvePath(nav.path, href);
          if (!labels.has(path)) labels.set(path, cleanText(anchor.textContent || ''));
        } catch { /* Ignore remote navigation links. */ }
      }
    } else if (ncx) {
      const doc = xml(await readText(ncx.path));
      for (const point of elements(doc, 'navPoint')) {
        const href = elements(point, 'content')[0]?.getAttribute('src');
        const label = cleanText(elements(point, 'navLabel')[0]?.textContent || '');
        if (!href) continue;
        const path = resolvePath(ncx.path, href);
        if (!labels.has(path)) labels.set(path, label);
      }
    }

    const images = new Map<string, string>();
    const imageUrl = async (chapterPath: string, href: string) => {
      // Never fetch remote images or expose arbitrary book URLs to the page.
      let path: string;
      try { path = resolvePath(chapterPath, href); } catch { return null; }
      if (images.has(path)) return images.get(path)!;
      const item = Array.from(manifest.values()).find(entry => entry.path === path);
      const extension = path.split('.').pop()?.toLowerCase();
      const mime = item?.mediaType || ({
        jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
        gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', avif: 'image/avif',
      } as Record<string, string>)[extension || ''];
      if (!mime?.startsWith('image/') || !zip.file(path)) return null;
      const bytes = await readBytes(path);
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
      images.set(path, url);
      objectUrls.push(url);
      return url;
    };

    const chapters: Chapter[] = [];
    const blockTags = new Set(['p', 'div', 'section', 'article', 'h1', 'h2', 'h3', 'h4',
      'h5', 'h6', 'li', 'blockquote', 'pre', 'tr', 'figcaption', 'figure', 'hr']);
    const ignoredTags = new Set(['script', 'style', 'head', 'nav', 'iframe', 'object',
      'audio', 'video', 'noscript']);
    for (const ref of spine ? elements(spine, 'itemref') : []) {
      if (ref.getAttribute('linear') === 'no') continue;
      const item = manifest.get(ref.getAttribute('idref') || '');
      if (!item || !['application/xhtml+xml', 'text/html'].includes(item.mediaType)) continue;
      const source = await readText(item.path);
      const doc = item.mediaType === 'text/html'
        ? new DOMParser().parseFromString(source, 'text/html') : xml(source);
      const body = elements(doc, 'body')[0];
      if (!body) continue;
      const segments: string[] = [];
      const blocks: ReadingBlock[] = [];
      let pending = '';
      const flush = () => {
        const text = cleanText(pending);
        pending = '';
        if (text) {
          blocks.push({ type: 'text', segmentIndex: segments.length });
          segments.push(text);
        }
      };
      const walk = async (node: Node): Promise<void> => {
        if (node.nodeType === 3) { pending += node.textContent || ''; return; }
        if (node.nodeType !== 1) return;
        const el = node as Element;
        const tag = el.localName.toLowerCase();
        if (ignoredTags.has(tag) || el.hasAttribute('hidden') ||
            el.getAttribute('aria-hidden') === 'true') return;
        if (tag === 'img' || tag === 'image') {
          flush();
          const href = el.getAttribute('src') || el.getAttribute('href') ||
            el.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
          const alt = el.getAttribute('alt') || elements(el, 'title')[0]?.textContent || '';
          const src = href ? await imageUrl(item.path, href) : null;
          if (src) blocks.push({ type: 'image', src, alt });
          else if (alt) {
            // Missing illustrations remain visible but are not spoken.
            blocks.push({ type: 'image', src: '', alt });
          }
          return;
        }
        if (tag === 'br') { flush(); return; }
        const isBlock = blockTags.has(tag);
        if (isBlock) flush();
        for (const child of Array.from(el.childNodes)) await walk(child);
        if (isBlock) flush();
      };
      await walk(body);
      flush();
      if (!blocks.length) continue;
      const heading = ['h1', 'h2', 'h3'].map(tag => elements(body, tag)[0]).find(Boolean);
      const title = labels.get(item.path) || cleanText(heading?.textContent || '') ||
        cleanText(elements(doc, 'title')[0]?.textContent || '') || `第 ${chapters.length + 1} 节`;
      chapters.push({
        id: `epub-${chapters.length}`, title, segments, blocks, content: segments.join('\n'),
      });
    }
    if (!chapters.length) throw new Error('EPUB 没有可读取的章节，或文件已加密');
    return {
      filename, title: cleanText(elements(opf, 'title')[0]?.textContent || '') || filename,
      chapters, objectUrls,
    };
  } catch (error) {
    objectUrls.forEach(url => URL.revokeObjectURL(url));
    throw error instanceof Error ? error : new Error('无法读取 EPUB 文件');
  }
}
