import React, { useEffect, useState } from 'react';
import { RefreshCw, ArrowUpRight } from 'lucide-react';
import { LibraryBook, localDayNumber, recommendedBooks } from '../utils/library';

const covers: Record<string, string> = {
  rose: 'from-rose-100 to-orange-50 text-rose-950',
  amber: 'from-amber-100 to-yellow-50 text-amber-950',
  teal: 'from-teal-100 to-emerald-50 text-teal-950',
  indigo: 'from-indigo-100 to-slate-50 text-indigo-950',
  stone: 'from-stone-200 to-amber-50 text-stone-900',
  emerald: 'from-emerald-100 to-lime-50 text-emerald-950',
  violet: 'from-violet-100 to-fuchsia-50 text-violet-950',
  slate: 'from-slate-200 to-gray-50 text-slate-900',
  sky: 'from-sky-100 to-cyan-50 text-sky-950',
};

export function RecommendedBooks({ language, disabled, onRead }: {
  language: 'zh' | 'en'; disabled: boolean; onRead: (entry: LibraryBook) => void;
}) {
  const [day, setDay] = useState(localDayNumber);
  const [batch, setBatch] = useState(0);
  useEffect(() => {
    const refresh = () => setDay(localDayNumber());
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, []);
  useEffect(() => { setBatch(0); }, [day]);
  const books = recommendedBooks(language, day, batch);
  const title = language === 'zh' ? '中文经典' : '外文原著';
  return <aside aria-label={title} className="rounded-2xl border border-stone-200/80 bg-white/70 p-5">
    <div className="flex items-center justify-between gap-2 mb-1">
      <h2 className="font-serif font-bold text-lg text-stone-800">{title}</h2>
      <button onClick={() => setBatch(value => value + 1)} aria-label={`${title}换一批`}
        className="flex items-center gap-1 text-xs text-stone-500 hover:text-amber-700 rounded p-1">
        <RefreshCw size={13} />换一批
      </button>
    </div>
    <p className="text-xs text-stone-500 mb-5">每日轮换 · {language === 'zh' ? '繁体原文' : '英文原版'}</p>
    <div className="space-y-4">
      {books.map(entry => <article key={entry.id} className="overflow-hidden rounded-xl border border-stone-200 bg-white">
        <button disabled={disabled} onClick={() => onRead(entry)} aria-label={`阅读《${entry.title}》`}
          className={`block w-full min-h-28 text-left px-5 py-5 bg-gradient-to-br ${covers[entry.tone]} border-l-4 border-black/10 disabled:opacity-50`}>
          <span className="text-[10px] tracking-widest uppercase opacity-60">ZenReader Classics</span>
          <h3 className="font-serif text-lg font-bold leading-snug mt-2 break-words">{entry.title}</h3>
          <p className="text-xs mt-2 opacity-75">{entry.author}</p>
        </button>
        <div className="p-4">
          <p className="text-xs leading-relaxed text-stone-500">{entry.description}</p>
          <div className="mt-3 flex justify-between items-center gap-2">
            <button disabled={disabled} onClick={() => onRead(entry)} className="text-sm font-medium text-amber-700 hover:text-amber-900 disabled:opacity-50">开始阅读 →</button>
            <a href={entry.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center text-xs text-stone-400 hover:text-stone-700" aria-label={`《${entry.title}》来源与版本`}>来源<ArrowUpRight size={12} /></a>
          </div>
        </div>
      </article>)}
    </div>
    <p className="mt-4 text-[11px] leading-relaxed text-stone-400">精选古典原文，不含现代译注。<a href="/library/SOURCES.md" target="_blank" rel="noreferrer" className="underline">来源与版权说明</a></p>
  </aside>;
}
