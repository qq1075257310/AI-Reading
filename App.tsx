import React, { useState, useEffect, useRef } from 'react';
import { Book, TTSConfig } from './types';
import { parseBookContent } from './utils/parser';
import { parseEpub } from './utils/epub';
import { listBooks, saveBook, loadBook, saveProgress, deleteBook,
  type ShelfEntry, type ReadingProgress } from './utils/bookshelf';
import { useTTS } from './hooks/useTTS';
import { ControlBar } from './components/ControlBar';
import { Menu, BookOpen, Upload, Library, Trash2 } from 'lucide-react';

const App: React.FC = () => {
  // --- State ---
  const [book, setBook] = useState<Book | null>(null);
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0);
  const [activeSegmentIndex, setActiveSegmentIndex] = useState(0); // For highlight & TTS
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [importError, setImportError] = useState('');
  const [storageError, setStorageError] = useState('');
  const [shelf, setShelf] = useState<ShelfEntry[]>([]);
  const [isShelfLoading, setIsShelfLoading] = useState(true);
  const [bookId, setBookId] = useState<number | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  
  const [ttsConfig, setTTSConfig] = useState<TTSConfig>({
    rate: 1.0,
    pitch: 1.0,
    volume: 1.0,
    voiceURI: null,
  });

  // --- Refs ---
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeSegmentRef = useRef<HTMLSpanElement>(null);
  const contentContainerRef = useRef<HTMLDivElement>(null);
  const restoreScrollRef = useRef<number | null>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const importInProgressRef = useRef(false);
  const dropImportRef = useRef<(file: File) => Promise<void>>(null);
  const loadingRef = useRef(isLoading);
  loadingRef.current = isLoading;
  const progressRef = useRef<{ id: number; progress: ReadingProgress } | null>(null);
  progressRef.current = bookId === null ? null : {
    id: bookId, progress: { chapterIndex: currentChapterIndex, segmentIndex: activeSegmentIndex,
      scrollTop: restoreScrollRef.current ?? contentContainerRef.current?.scrollTop ?? 0 },
  };

  // --- Custom Hooks ---
  const { 
    speakSegment,
    updateConfig: updateTTSConfig, 
    pause: ttsPause, 
    resume: ttsResume, 
    stop: ttsStop, 
    isSpeaking,
    isPaused,
    supportedVoices 
  } = useTTS();

  // --- Effects ---

  const refreshShelf = async () => {
    try {
      setShelf(await listBooks());
    } catch {
      setStorageError('无法读取本地书架，请检查浏览器是否允许网站存储。现有数据不会被删除。');
    } finally {
      setIsShelfLoading(false);
    }
  };
  useEffect(() => { void refreshShelf(); }, []);

  const persistProgress = async () => {
    const current = progressRef.current;
    if (!current) return;
    try {
      await saveProgress(current.id, current.progress);
    } catch {
      setStorageError('阅读进度保存失败，请检查浏览器存储空间。');
    }
  };

  useEffect(() => {
    if (restoreScrollRef.current !== null && contentContainerRef.current) {
      contentContainerRef.current.scrollTop = restoreScrollRef.current;
      restoreScrollRef.current = null;
    }
    void persistProgress();
  }, [book, bookId, currentChapterIndex, activeSegmentIndex]);

  useEffect(() => {
    const flush = () => { void persistProgress(); };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    };
  }, []);

  const handleReaderScroll = () => {
    if (progressRef.current && contentContainerRef.current) {
      progressRef.current.progress.scrollTop = contentContainerRef.current.scrollTop;
    }
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current = setTimeout(() => { void persistProgress(); }, 250);
  };

  const openCachedBook = async (id: number) => {
    if (isLoading) return;
    setIsLoading(true);
    setImportError('');
    shouldAutoPlay.current = false;
    ttsStop();
    try {
      const { book: savedBook, progress } = await loadBook(id);
      const chapter = Math.max(0, Math.min(progress?.chapterIndex || 0, savedBook.chapters.length - 1));
      const segment = Math.max(0, Math.min(progress?.segmentIndex || 0,
        Math.max(0, savedBook.chapters[chapter].segments.length - 1)));
      restoreScrollRef.current = Math.max(0, progress?.scrollTop || 0);
      setBook(savedBook);
      setBookId(id);
      setCurrentChapterIndex(chapter);
      setActiveSegmentIndex(segment);
      if (window.innerWidth < 768) setIsSidebarOpen(false);
    } catch (error) {
      // A failed read must never remove the user's only cached copy.
      setImportError(error instanceof Error ? error.message : '读取缓存失败，原记录仍保留');
    } finally {
      setIsLoading(false);
    }
  };

  const returnToShelf = async () => {
    shouldAutoPlay.current = false;
    ttsStop();
    await persistProgress();
    setBook(null);
    setBookId(null);
    setImportError('');
    await refreshShelf();
  };

  const removeCachedBook = async (entry: ShelfEntry) => {
    if (entry.id === undefined || !window.confirm(`确定从本地书架删除《${entry.title}》吗？`)) return;
    try {
      await deleteBook(entry.id);
      await refreshShelf();
    } catch {
      setStorageError('删除失败，书架记录仍保留。');
    }
  };

  useEffect(() => () => {
    book?.objectUrls?.forEach(url => URL.revokeObjectURL(url));
  }, [book]);

  // Scroll active segment into view
  useEffect(() => {
    if (activeSegmentRef.current && isSpeaking) {
      activeSegmentRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [activeSegmentIndex, currentChapterIndex, isSpeaking]);

  // File picker and drag-and-drop share parsing, validation and persistent storage.
  const importFile = async (file: File) => {
    if (importInProgressRef.current || loadingRef.current) return;
    importInProgressRef.current = true;
    setIsLoading(true);
    setImportError('');
    shouldAutoPlay.current = false;
    ttsStop();
    try {
      const extension = file.name.split('.').pop()?.toLowerCase();
      if (extension !== 'txt' && extension !== 'epub') {
        throw new Error('请选择 TXT 或 EPUB 文件');
      }
      if (extension === 'epub' && file.size > 50 * 1024 * 1024) {
        throw new Error('EPUB 文件不能超过 50 MB');
      }
      const data = await file.arrayBuffer();
      let parsedBook: Book;
      if (extension === 'epub') {
        parsedBook = await parseEpub(file.name, data);
      } else {
        let text = new TextDecoder('utf-8').decode(data);
        if (text.includes('\uFFFD')) text = new TextDecoder('gb18030').decode(data);
        if (!text.trim()) throw new Error('TXT 文件没有可读取的正文');
        parsedBook = parseBookContent(file.name, text);
      }
      let savedId: number | null = null;
      try {
        savedId = await saveBook(file, data, parsedBook);
        setStorageError('');
      } catch {
        setStorageError('本书可以阅读，但未能保存到本地书架。请检查存储权限或剩余空间。');
      }
      restoreScrollRef.current = 0;
      setBook(parsedBook);
      setBookId(savedId);
      setCurrentChapterIndex(0);
      setActiveSegmentIndex(0);
      contentContainerRef.current?.scrollTo(0, 0);
      if (window.innerWidth < 768) setIsSidebarOpen(false);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : '读取文件失败');
    } finally {
      importInProgressRef.current = false;
      setIsLoading(false);
    }
  };
  dropImportRef.current = importFile;

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void importFile(file);
  };

  useEffect(() => {
    let depth = 0;
    const hasFiles = (event: DragEvent) =>
      Array.from(event.dataTransfer?.types || []).includes('Files');
    const reset = () => {
      depth = 0;
      setIsDraggingFile(false);
    };
    const enter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth += 1;
      if (!loadingRef.current) setIsDraggingFile(true);
    };
    const over = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      // Prevent the browser from navigating to a dropped local file.
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = loadingRef.current ? 'none' : 'copy';
      }
    };
    const leave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) reset();
    };
    const drop = (event: DragEvent) => {
      if (!hasFiles(event) && !event.dataTransfer?.files.length) return;
      event.preventDefault();
      reset();
      if (loadingRef.current || importInProgressRef.current) return;
      const files = Array.from(event.dataTransfer?.files || []);
      if (files.length !== 1) {
        setImportError('请每次拖入一个 TXT 或 EPUB 文件');
        return;
      }
      void dropImportRef.current?.(files[0]);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    window.addEventListener('dragend', reset);
    window.addEventListener('blur', reset);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
      window.removeEventListener('dragend', reset);
      window.removeEventListener('blur', reset);
    };
  }, []);

  // --- Logic: TTS Flow Control ---

  // Trigger speaking the current segment
  const playCurrentSegment = (config: TTSConfig = ttsConfig) => {
    if (!book) return;
    
    const chapter = book.chapters[currentChapterIndex];
    if (!chapter) return;
    if (!chapter.segments.length) {
      // Covers and illustration-only sections stay visible, but are never spoken.
      const next = book.chapters.findIndex((entry, index) =>
        index > currentChapterIndex && entry.segments.length > 0);
      if (next >= 0) {
        setCurrentChapterIndex(next);
        setActiveSegmentIndex(0);
      } else {
        shouldAutoPlay.current = false;
        ttsStop();
      }
      return;
    }
    if (activeSegmentIndex >= chapter.segments.length) return;

    const text = chapter.segments[activeSegmentIndex];
    
    speakSegment(text, config, () => {
      // On End of segment:
      if (activeSegmentIndex < chapter.segments.length - 1) {
        // Move to next segment
        setActiveSegmentIndex(prev => prev + 1);
      } else {
        // End of Chapter
        if (currentChapterIndex < book.chapters.length - 1) {
          setCurrentChapterIndex(prev => prev + 1);
          setActiveSegmentIndex(0);
        } else {
          // End of Book
          shouldAutoPlay.current = false;
          ttsStop();
        }
      }
    });
  };

  const shouldAutoPlay = useRef(false);

  useEffect(() => {
    if (shouldAutoPlay.current) {
      playCurrentSegment();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSegmentIndex, currentChapterIndex]);

  const handlePlayPause = () => {
    if (isSpeaking) {
      ttsPause();
      shouldAutoPlay.current = false;
    } else if (isPaused) {
      ttsResume();
      shouldAutoPlay.current = true;
    } else {
      shouldAutoPlay.current = true;
      playCurrentSegment();
    }
  };

  const handleTTSConfigChange = (config: TTSConfig) => {
    const voiceChanged = (config.voiceURI || null) !== (ttsConfig.voiceURI || null);
    setTTSConfig(config);
    if (voiceChanged && book) {
      shouldAutoPlay.current = true;
      playCurrentSegment(config);
    } else {
      updateTTSConfig(config);
    }
  };

  const handleNextChapter = () => {
    ttsStop();
    shouldAutoPlay.current = false; // Stop auto play on manual jump
    if (book && currentChapterIndex < book.chapters.length - 1) {
      setCurrentChapterIndex(prev => prev + 1);
      setActiveSegmentIndex(0);
      contentContainerRef.current?.scrollTo(0, 0);
    }
  };

  const handlePrevChapter = () => {
    ttsStop();
    shouldAutoPlay.current = false;
    if (currentChapterIndex > 0) {
      setCurrentChapterIndex(prev => prev - 1);
      setActiveSegmentIndex(0);
      contentContainerRef.current?.scrollTo(0, 0);
    }
  };

  const handleChapterSelect = (index: number) => {
    ttsStop();
    shouldAutoPlay.current = false;
    setCurrentChapterIndex(index);
    setActiveSegmentIndex(0);
    if (window.innerWidth < 768) setIsSidebarOpen(false);
    
    // Scroll top of content
    contentContainerRef.current?.scrollTo(0,0);
  };

  const handleSegmentClick = (index: number) => {
    // If user clicks a paragraph, jump there.
    // If playing, restart play from there.
    const wasPlaying = isSpeaking || shouldAutoPlay.current;
    ttsStop();
    setActiveSegmentIndex(index);
    
    // We need a microtask delay or effect to pick this up, 
    // but since we set state, the effect above will catch it if we set flag
    if (wasPlaying) {
        shouldAutoPlay.current = true;
    }
  };

  // --- Rendering ---

  const dropOverlay = isDraggingFile && (
    <div role="status" className="fixed inset-0 z-[100] pointer-events-none flex items-center justify-center bg-amber-50/90 border-4 border-dashed border-amber-500">
      <div className="text-center p-8">
        <Upload size={48} className="mx-auto mb-4 text-amber-600" />
        <p className="text-xl font-bold text-stone-800">松开以导入书籍</p>
        <p className="mt-2 text-stone-600">支持 TXT / EPUB，每次一个文件</p>
      </div>
    </div>
  );

  if (!book) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F7F6F2] p-4">
        {dropOverlay}
        <div className="bg-white p-10 rounded-2xl shadow-xl text-center max-w-md w-full border border-stone-100">
          <BookOpen size={64} className="mx-auto text-amber-600 mb-6" />
          <h1 className="text-3xl font-serif font-bold text-stone-800 mb-2">ZenReader</h1>
          <p className="text-stone-500 mb-8">本地 TXT / EPUB 小说沉浸式阅读器</p>
          
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="cursor-pointer border-2 border-dashed border-amber-200 hover:border-amber-400 hover:bg-amber-50 transition-all rounded-xl p-8 flex flex-col items-center"
          >
            <Upload size={32} className="text-amber-500 mb-2" />
            <span className="text-stone-600 font-medium">点击选择或拖入 TXT / EPUB 文件</span>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
              accept=".txt,.epub,application/epub+zip"
              disabled={isLoading}
              className="hidden" 
            />
          </div>
          {isLoading && <p className="mt-4 text-amber-600 animate-pulse">正在解析书籍目录...</p>}
          {importError && <p role="alert" className="mt-4 text-red-600">{importError}</p>}
          {storageError && <p role="alert" className="mt-4 text-red-600">{storageError}</p>}
          <p className="text-xs text-stone-400 mt-4">TXT 支持 UTF-8 / GBK；EPUB 支持目录及插图（无 DRM，最大 50 MB）</p>
          <p className="text-xs text-stone-400 mt-2">导入文件保存在当前浏览器的本地书架，刷新后可继续阅读。</p>
          <section aria-label="本地书架" className="mt-6 text-left">
            <h2 className="font-bold text-stone-700 mb-3">本地书架</h2>
            {isShelfLoading ? <p role="status">正在读取书架...</p>
              : shelf.length === 0 && <p className="text-sm text-stone-500">书架为空，先导入一本书吧。</p>}
            <div className="space-y-3">
              {shelf.map(entry => <div key={entry.id}
                className="flex items-center gap-2 border border-stone-200 rounded-lg p-3">
                <button disabled={isLoading} onClick={() => void openCachedBook(entry.id!)}
                  className="min-w-0 flex-1 text-left hover:text-amber-700 disabled:opacity-50">
                  <span className="block break-words font-medium">{entry.title}</span>
                  <span className="block text-xs text-stone-500 mt-1">
                    {entry.format?.toUpperCase() || 'TXT'} · 上次阅读：{new Date(entry.lastReadTime).toLocaleString()}
                  </span>
                </button>
                <button disabled={isLoading} onClick={() => void removeCachedBook(entry)}
                  aria-label={`删除《${entry.title}》`}
                  className="shrink-0 p-2 text-red-600 hover:bg-red-50 rounded-full">
                  <Trash2 size={18} />
                </button>
              </div>)}
            </div>
          </section>
        </div>
      </div>
    );
  }

  const currentChapter = book.chapters[currentChapterIndex];

  return (
    <div className="flex h-screen overflow-hidden bg-[#F7F6F2]">
      {dropOverlay}
      {/* Sidebar */}
      <aside 
        className={`
          fixed md:relative z-40 h-full bg-stone-100 border-r border-stone-200 shadow-lg md:shadow-none w-72 transition-transform duration-300 ease-in-out
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0 md:w-0 md:opacity-0 md:overflow-hidden'}
        `}
      >
        <div className="flex flex-col h-full">
          <div className="p-4 border-b border-stone-200 bg-stone-100">
             <h2 className="font-bold text-stone-700 truncate" title={book.filename}>{book.title || book.filename}</h2>
             <p className="text-xs text-stone-500 mt-1">共 {book.chapters.length} 章</p>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {book.chapters.map((chapter, idx) => (
              <button
                key={chapter.id}
                onClick={() => handleChapterSelect(idx)}
                className={`w-full text-left px-3 py-2 rounded-md text-sm truncate transition-colors
                  ${currentChapterIndex === idx 
                    ? 'bg-amber-100 text-amber-900 font-medium' 
                    : 'text-stone-600 hover:bg-stone-200'
                  }
                `}
              >
                {chapter.title}
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* Overlay for mobile sidebar */}
      {isSidebarOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-black/20 z-30"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full relative">
        {/* Header */}
        <header className="h-14 flex items-center px-4 border-b border-stone-200/50 bg-[#F7F6F2] z-10">
          <button onClick={() => void returnToShelf()} disabled={isLoading}
            aria-label="返回书架" title="返回书架"
            className="p-2 hover:bg-stone-200 rounded-full text-stone-600">
            <Library size={20} />
          </button>
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            aria-label="切换目录"
            className="p-2 hover:bg-stone-200 rounded-full text-stone-600 mr-3"
          >
            <Menu size={20} />
          </button>
          <h2 className="font-serif text-lg font-bold text-stone-800 truncate flex-1 text-center md:text-left">
            {currentChapter.title}
          </h2>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            title="导入另一本文档"
            aria-label="导入另一本文档"
            className="p-2 hover:bg-stone-200 rounded-full text-stone-600 disabled:opacity-50"
          ><Upload size={20} /></button>
          <input type="file" ref={fileInputRef} onChange={handleFileUpload}
            accept=".txt,.epub,application/epub+zip" disabled={isLoading} className="hidden" />
        </header>
        {isLoading && <p role="status" className="px-4 py-2 text-amber-700">正在导入书籍...</p>}
        {importError && <p role="alert" className="px-4 py-2 text-red-600">{importError}</p>}
        {storageError && <p role="alert" className="px-4 py-2 text-red-600">{storageError}</p>}

        {/* Reader Content */}
        <div 
          ref={contentContainerRef}
          onScroll={handleReaderScroll}
          className="flex-1 overflow-y-auto px-4 md:px-0 pb-24 scroll-smooth"
        >
          <div className="max-w-3xl mx-auto py-8 md:py-12">
            <h1 className="text-2xl md:text-3xl font-serif font-bold text-stone-800 mb-8 px-4">
              {currentChapter.title}
            </h1>
            
            <div className="space-y-4 text-lg md:text-xl leading-relaxed text-stone-700 font-serif">
              {(currentChapter.blocks || currentChapter.segments.map((_, segmentIndex) =>
                ({ type: 'text' as const, segmentIndex }))).map((block, blockIndex) => {
                if (block.type === 'image') {
                  return <figure key={blockIndex} className="px-4 py-4">
                    {block.src ? <img src={block.src} alt={block.alt} loading="lazy"
                      className="block max-w-full max-h-[80vh] w-auto h-auto mx-auto object-contain rounded" />
                      : <figcaption className="text-sm text-stone-500">图片无法显示：{block.alt}</figcaption>}
                  </figure>;
                }
                const idx = block.segmentIndex;
                const segment = currentChapter.segments[idx];
                const isActive = idx === activeSegmentIndex;
                return (
                  <p 
                    key={blockIndex}
                    onClick={() => handleSegmentClick(idx)}
                    className={`
                      px-4 py-1 rounded transition-colors duration-300 cursor-pointer hover:bg-black/5
                      ${isActive ? 'bg-amber-100 text-stone-900' : ''}
                    `}
                  >
                    {/* Attach Ref if active for scrolling */}
                    {isActive ? <span ref={activeSegmentRef}>{segment}</span> : segment}
                  </p>
                );
              })}
            </div>
            
            {/* Bottom Nav Buttons in text */}
            <div className="flex justify-between mt-12 px-4">
              <button 
                onClick={handlePrevChapter}
                disabled={currentChapterIndex === 0}
                className="px-6 py-2 rounded-full border border-stone-300 text-stone-600 hover:bg-stone-200 disabled:opacity-50"
              >
                上一章
              </button>
              <button 
                onClick={handleNextChapter}
                disabled={currentChapterIndex === book.chapters.length - 1}
                className="px-6 py-2 rounded-full bg-stone-800 text-stone-100 hover:bg-black disabled:opacity-50"
              >
                下一章
              </button>
            </div>
          </div>
        </div>

        {/* Audio Controls */}
        <ControlBar 
          isPlaying={isSpeaking || (shouldAutoPlay.current && !isPaused)} // Visual state fix
          onPlayPause={handlePlayPause}
          onNext={handleNextChapter}
          onPrev={handlePrevChapter}
          config={ttsConfig}
          onConfigChange={handleTTSConfigChange}
          voices={supportedVoices}
          currentChapterTitle={currentChapter.title}
        />
      </main>
    </div>
  );
};

export default App;
