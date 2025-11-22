import React, { useState, useEffect, useRef } from 'react';
import { Book, TTSConfig } from './types';
import { parseBookContent } from './utils/parser';
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
    pause: ttsPause, 
    resume: ttsResume, 
    stop: ttsStop, 
    isSpeaking,
    isPaused,
    supportedVoices 
  } = useTTS();

  // --- Effects ---

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
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    ttsStop();
    
    const processText = (text: string) => {
      if (text) {
        const parsedBook = parseBookContent(file.name, text);
        setBook(parsedBook);
        setCurrentChapterIndex(0);
        setActiveSegmentIndex(0);
        // Reset scroll position
        contentContainerRef.current?.scrollTo(0, 0);
      }
      setIsLoading(false);
      // On mobile, close sidebar after load
      if (window.innerWidth < 768) setIsSidebarOpen(false);
    };

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      
      // Intelligent Encoding Detection
      // If UTF-8 decoding produced replacement characters (), it's likely the file is GBK/GB18030
      if (text.includes('\uFFFD')) {
        console.log("UTF-8 decoding failed (found ), retrying with GB18030...");
        const retryReader = new FileReader();
        retryReader.onload = (retryE) => {
          const retryText = retryE.target?.result as string;
          processText(retryText);
        };
        retryReader.readAsText(file, 'GB18030');
      } else {
        processText(text);
      }
    };

    reader.onerror = () => {
      alert("读取文件失败");
      setIsLoading(false);
    };

    // Default to UTF-8 first
    reader.readAsText(file); 
    
    // Reset input value so the same file can be re-uploaded if needed
    event.target.value = '';
  };

  // --- Logic: TTS Flow Control ---

  // Trigger speaking the current segment
  const playCurrentSegment = () => {
    if (!book) return;
    
    const chapter = book.chapters[currentChapterIndex];
    if (!chapter || activeSegmentIndex >= chapter.segments.length) return;

    const text = chapter.segments[activeSegmentIndex];
    
    speakSegment(text, ttsConfig, () => {
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
          <p className="text-stone-500 mb-8">本地 TXT 小说沉浸式阅读器</p>
          
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="cursor-pointer border-2 border-dashed border-amber-200 hover:border-amber-400 hover:bg-amber-50 transition-all rounded-xl p-8 flex flex-col items-center"
          >
            <Upload size={32} className="text-amber-500 mb-2" />
            <span className="text-stone-600 font-medium">点击上传 .txt 文件</span>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
              accept=".txt" 
              className="hidden" 
            />
          </div>
          {isLoading && <p className="mt-4 text-amber-600 animate-pulse">正在解析书籍目录...</p>}
          <p className="text-xs text-stone-400 mt-4">支持 UTF-8 及 GBK/GB18030 编码</p>
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
             <h2 className="font-bold text-stone-700 truncate" title={book.filename}>{book.filename}</h2>
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
            className="p-2 hover:bg-stone-200 rounded-full text-stone-600 mr-3"
          >
            <Menu size={20} />
          </button>
          <h2 className="font-serif text-lg font-bold text-stone-800 truncate flex-1 text-center md:text-left">
            {currentChapter.title}
          </h2>
          <div className="w-8"></div> {/* Spacer for balance */}
        </header>

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
              {currentChapter.segments.map((segment, idx) => {
                const isActive = idx === activeSegmentIndex;
                return (
                  <p 
                    key={idx}
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
          onConfigChange={setTTSConfig}
          voices={supportedVoices}
          currentChapterTitle={currentChapter.title}
        />
      </main>
    </div>
  );
};

export default App;