import React, { useState, useEffect, useRef } from 'react';
import { Book, TTSConfig } from './types';
import { parseBookContent } from './utils/parser';
import { parseEpub } from './utils/epub';
import { useTTS } from './hooks/useTTS';
import { ControlBar } from './components/ControlBar';
import { Menu, BookOpen, Upload, AlertCircle } from 'lucide-react';

const App: React.FC = () => {
  // --- State ---
  const [book, setBook] = useState<Book | null>(null);
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0);
  const [activeSegmentIndex, setActiveSegmentIndex] = useState(0); // For highlight & TTS
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [importError, setImportError] = useState('');
  
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

  // Handle File Upload
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';
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
      setBook(parsedBook);
      setCurrentChapterIndex(0);
      setActiveSegmentIndex(0);
      contentContainerRef.current?.scrollTo(0, 0);
      if (window.innerWidth < 768) setIsSidebarOpen(false);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : '读取文件失败');
    } finally {
      setIsLoading(false);
    }
  };

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

  if (!book) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F7F6F2] p-4">
        <div className="bg-white p-10 rounded-2xl shadow-xl text-center max-w-md w-full border border-stone-100">
          <BookOpen size={64} className="mx-auto text-amber-600 mb-6" />
          <h1 className="text-3xl font-serif font-bold text-stone-800 mb-2">ZenReader</h1>
          <p className="text-stone-500 mb-8">本地 TXT / EPUB 小说沉浸式阅读器</p>
          
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="cursor-pointer border-2 border-dashed border-amber-200 hover:border-amber-400 hover:bg-amber-50 transition-all rounded-xl p-8 flex flex-col items-center"
          >
            <Upload size={32} className="text-amber-500 mb-2" />
            <span className="text-stone-600 font-medium">点击上传 TXT 或 EPUB 文件</span>
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
          <p className="text-xs text-stone-400 mt-4">TXT 支持 UTF-8 / GBK；EPUB 支持目录及插图（无 DRM，最大 50 MB）</p>
        </div>
      </div>
    );
  }

  const currentChapter = book.chapters[currentChapterIndex];

  return (
    <div className="flex h-screen overflow-hidden bg-[#F7F6F2]">
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

        {/* Reader Content */}
        <div 
          ref={contentContainerRef}
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
