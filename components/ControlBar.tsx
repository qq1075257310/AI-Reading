import React from 'react';
import { Play, Pause, SkipBack, SkipForward, Settings, ChevronUp, X } from 'lucide-react';
import { TTSConfig } from '../types';

interface ControlBarProps {
  isPlaying: boolean;
  onPlayPause: () => void;
  onNext: () => void;
  onPrev: () => void;
  config: TTSConfig;
  onConfigChange: (newConfig: TTSConfig) => void;
  voices: SpeechSynthesisVoice[];
  currentChapterTitle: string;
}

export const ControlBar: React.FC<ControlBarProps> = ({
  isPlaying,
  onPlayPause,
  onNext,
  onPrev,
  config,
  onConfigChange,
  voices,
  currentChapterTitle
}) => {
  const [showSettings, setShowSettings] = React.useState(false);

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] border-t border-stone-200 z-50">
      
      {/* Expanded Settings Panel */}
      {showSettings && (
        <div className="border-b border-stone-200 p-4 bg-stone-50 animate-in slide-in-from-bottom-10 duration-200">
          <div className="max-w-3xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Speed Control */}
            <div>
              <label className="text-sm font-medium text-stone-600 mb-2 block">
                语速 (Speed): {config.rate}x
              </label>
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.1"
                value={config.rate}
                onChange={(e) => onConfigChange({ ...config, rate: parseFloat(e.target.value) })}
                className="w-full h-2 bg-stone-300 rounded-lg appearance-none cursor-pointer accent-amber-600"
              />
              <div className="flex justify-between text-xs text-stone-400 mt-1">
                <span>0.5x</span>
                <span>1.0x</span>
                <span>2.0x</span>
              </div>
            </div>

            {/* Voice Selection */}
            <div>
              <label className="text-sm font-medium text-stone-600 mb-2 block">
                朗读声音 (Voice)
              </label>
              <select
                className="w-full p-2 rounded border border-stone-300 bg-white text-sm text-stone-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none"
                value={config.voiceURI || ''}
                onChange={(e) => onConfigChange({ ...config, voiceURI: e.target.value })}
              >
                <option value="">Default System Voice</option>
                {voices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name} ({v.lang})
                  </option>
                ))}
              </select>
            </div>

          </div>
          
          <button 
            onClick={() => setShowSettings(false)}
            className="absolute top-2 right-2 p-1 hover:bg-stone-200 rounded-full text-stone-500"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Main Control Bar */}
      <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
        
        {/* Left: Chapter Info (Hidden on small mobile) */}
        <div className="hidden sm:block w-1/4 truncate text-xs text-stone-500">
          {currentChapterTitle}
        </div>

        {/* Center: Playback Controls */}
        <div className="flex items-center justify-center gap-6 flex-1">
          <button 
            onClick={onPrev}
            className="p-2 text-stone-600 hover:text-amber-700 hover:bg-stone-100 rounded-full transition-colors"
            title="Previous Chapter"
          >
            <SkipBack size={20} />
          </button>

          <button 
            onClick={onPlayPause}
            className="p-3 bg-amber-600 text-white rounded-full shadow-md hover:bg-amber-700 hover:scale-105 transition-all active:scale-95"
          >
            {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-0.5"/>}
          </button>

          <button 
            onClick={onNext}
            className="p-2 text-stone-600 hover:text-amber-700 hover:bg-stone-100 rounded-full transition-colors"
            title="Next Chapter"
          >
            <SkipForward size={20} />
          </button>
        </div>

        {/* Right: Settings Toggle */}
        <div className="w-1/4 flex justify-end">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`p-2 rounded-lg transition-colors flex items-center gap-2 text-sm font-medium ${showSettings ? 'bg-stone-200 text-stone-800' : 'text-stone-600 hover:bg-stone-100'}`}
          >
            <Settings size={18} />
            <span className="hidden sm:inline">设置</span>
            {showSettings ? <ChevronUp size={14} /> : null}
          </button>
        </div>

      </div>
    </div>
  );
};
