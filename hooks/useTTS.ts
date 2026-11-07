import { useState, useEffect, useRef, useCallback } from 'react';
import { TTSConfig } from '../types';

export const useTTS = () => {
  const [supportedVoices, setSupportedVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const playbackRef = useRef<{
    text: string;
    config: TTSConfig;
    onEnd: () => void;
    offset: number;
    hasBoundary: boolean;
  } | null>(null);

  // Invalidate before cancel(): some engines dispatch cancellation events immediately.
  const cancelUtterance = useCallback(() => {
    const utterance = utteranceRef.current;
    utteranceRef.current = null;
    if (utterance) {
      utterance.onend = null;
      utterance.onerror = null;
      utterance.onboundary = null;
    }
    window.speechSynthesis.cancel();
  }, []);

  useEffect(() => {
    const synth = window.speechSynthesis;
    const loadVoices = () => {
      const voices = synth.getVoices();
      setSupportedVoices([
        ...voices.filter(v => v.lang.includes('zh')),
        ...voices.filter(v => !v.lang.includes('zh')),
      ]);
    };
    loadVoices();
    synth.addEventListener('voiceschanged', loadVoices);
    return () => {
      synth.removeEventListener('voiceschanged', loadVoices);
      playbackRef.current = null;
      cancelUtterance();
    };
  }, [cancelUtterance]);

  const startUtterance = useCallback(() => {
    const playback = playbackRef.current;
    if (!playback) return;
    const synth = window.speechSynthesis;
    const startOffset = playback.offset;
    const utterance = new SpeechSynthesisUtterance(playback.text.slice(startOffset));
    utterance.rate = playback.config.rate;
    utterance.pitch = playback.config.pitch;
    utterance.volume = playback.config.volume;
    const voice = playback.config.voiceURI
      ? supportedVoices.find(v => v.voiceURI === playback.config.voiceURI)
      : supportedVoices.find(v => v.lang === 'zh-CN');
    if (voice) utterance.voice = voice;

    utterance.onboundary = (event) => {
      if (utteranceRef.current !== utterance) return;
      // Keep the last spoken word so resuming never skips unread text.
      playback.offset = startOffset + event.charIndex;
      playback.hasBoundary = true;
    };
    utterance.onend = () => {
      if (utteranceRef.current !== utterance) return;
      utteranceRef.current = null;
      playbackRef.current = null;
      setIsSpeaking(false);
      setIsPaused(false);
      playback.onEnd();
    };
    utterance.onerror = (event) => {
      if (utteranceRef.current !== utterance) return;
      utteranceRef.current = null;
      playbackRef.current = null;
      console.error('TTS Error', event);
      setIsSpeaking(false);
      setIsPaused(false);
    };

    utteranceRef.current = utterance;
    setIsSpeaking(true);
    setIsPaused(false);
    // Clear a lingering native pause before submitting a fresh utterance.
    if (synth.paused) synth.resume();
    synth.speak(utterance);
  }, [supportedVoices]);

  const speakSegment = useCallback((text: string, config: TTSConfig, onEnd: () => void) => {
    cancelUtterance();
    playbackRef.current = { text, config: { ...config }, onEnd, offset: 0, hasBoundary: false };
    startUtterance();
  }, [cancelUtterance, startUtterance]);

  const pause = useCallback(() => {
    if (!utteranceRef.current || !playbackRef.current) return;
    // Native pause/resume can stall on some engines. Retain our own position instead.
    cancelUtterance();
    setIsPaused(true);
    setIsSpeaking(false);
  }, [cancelUtterance]);

  const resume = useCallback(() => {
    if (!playbackRef.current || utteranceRef.current) return;
    startUtterance();
  }, [startUtterance]);

  const updateConfig = useCallback((config: TTSConfig) => {
    const playback = playbackRef.current;
    if (!playback) return;
    const previous = playback.config;
    const voiceChanged = (previous.voiceURI || null) !== (config.voiceURI || null);
    const settingsChanged = previous.rate !== config.rate ||
      previous.pitch !== config.pitch || previous.volume !== config.volume;
    playback.config = { ...config };

    if (voiceChanged) {
      cancelUtterance();
      playback.offset = 0;
      playback.hasBoundary = false;
      startUtterance();
    } else if (settingsChanged && utteranceRef.current) {
      if (playback.hasBoundary) {
        // Recreate at the last known word: changing rate on an active
        // utterance is ignored by many engines.
        cancelUtterance();
        startUtterance();
      } else {
        // Without boundary events there is no safe text position to resume.
        // Try an in-place update, never rewind the whole paragraph for speed.
        const utterance = utteranceRef.current;
        utterance.rate = config.rate;
        utterance.pitch = config.pitch;
        utterance.volume = config.volume;
      }
    }
    // While paused, speed changes only update the retained configuration.
  }, [cancelUtterance, startUtterance]);

  const stop = useCallback(() => {
    playbackRef.current = null;
    cancelUtterance();
    setIsSpeaking(false);
    setIsPaused(false);
  }, [cancelUtterance]);

  return { supportedVoices, isSpeaking, isPaused, speakSegment, pause, resume, stop, updateConfig };
};
