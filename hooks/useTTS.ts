import { useState, useEffect, useRef, useCallback } from 'react';
import { TTSConfig } from '../types';

export const useTTS = () => {
  const [supportedVoices, setSupportedVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  
  // We need to keep track of the utterance to cancel it properly
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      // Filter for Chinese voices primarily, but allow others
      const zhVoices = voices.filter(v => v.lang.includes('zh'));
      const otherVoices = voices.filter(v => !v.lang.includes('zh'));
      setSupportedVoices([...zhVoices, ...otherVoices]);
    };

    loadVoices();
    
    // Chrome loads voices asynchronously
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

  const speakSegment = useCallback((text: string, config: TTSConfig, onEnd: () => void) => {
    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = config.rate;
    utterance.pitch = config.pitch;
    utterance.volume = config.volume;

    if (config.voiceURI) {
      const voice = supportedVoices.find(v => v.voiceURI === config.voiceURI);
      if (voice) utterance.voice = voice;
    } else {
        // Default to first Chinese voice if available
        const defaultZh = supportedVoices.find(v => v.lang === 'zh-CN');
        if(defaultZh) utterance.voice = defaultZh;
    }

    utterance.onend = () => {
      setIsSpeaking(false);
      setIsPaused(false);
      onEnd();
    };

    utterance.onerror = (e) => {
      console.error("TTS Error", e);
      setIsSpeaking(false);
      setIsPaused(false);
    };

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
    setIsSpeaking(true);
    setIsPaused(false);
  }, [supportedVoices]);

  const pause = useCallback(() => {
    if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
      window.speechSynthesis.pause();
      setIsPaused(true);
      setIsSpeaking(false); // UI toggle
    }
  }, []);

  const resume = useCallback(() => {
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
      setIsPaused(false);
      setIsSpeaking(true);
    }
  }, []);

  const stop = useCallback(() => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
    setIsPaused(false);
  }, []);

  return {
    supportedVoices,
    isSpeaking,
    isPaused,
    speakSegment,
    pause,
    resume,
    stop
  };
};
