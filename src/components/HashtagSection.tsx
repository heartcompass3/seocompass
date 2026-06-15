import React, { useState } from 'react';
import { SocialResearch, SocialPlatform } from '../types';
import { Hash, Search, Sparkles, Clock, Layers, Copy, Check, Instagram, Facebook } from 'lucide-react';

interface HashtagSectionProps {
  loading: boolean;
  result: SocialResearch | null;
  onSearch: (topic: string, platform: SocialPlatform) => Promise<void>;
}

export default function HashtagSection({ loading, result, onSearch }: HashtagSectionProps) {
  const [topic, setTopic] = useState('אימון רגשי לנוער');
  const [platform, setPlatform] = useState<SocialPlatform>('instagram');
  const [copied, setCopied] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic) return;
    onSearch(topic, platform);
  };

  const sizeBadge = (size: string) => {
    if (size === 'broad') return 'bg-blue-50 text-blue-700 border-blue-150';
    if (size === 'niche') return 'bg-emerald-50 text-emerald-700 border-emerald-150';
    return 'bg-violet-50 text-violet-700 border-violet-150';
  };
  const sizeLabel = (size: string) => (size === 'broad' ? 'רחב' : size === 'niche' ? 'נישתי' : 'מותגי');

  const copyAll = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.hashtags.map((h) => h.tag).join(' '));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* blocked */ }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col gap-1 text-right">
            <h2 className="font-display font-bold text-slate-800 text-lg">מחקר האשטגים וזוויות תוכן</h2>
            <p className="text-xs text-slate-500">הזן נושא, וקבל תמהיל האשטגים (רחב/נישתי/מותגי), זוויות תוכן, חלונות פרסום ועמודי תוכן מומלצים.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 flex flex-col text-right">
              <label className="text-xs font-semibold text-slate-700 mb-1.5">נושא / נישה</label>
              <div className="relative">
                <Search className="absolute right-3.5 top-3 w-4.5 h-4.5 text-slate-400" />
                <input type="text" value={topic} onChange={(e) => setTopic(e.target.value)} required
                  className="w-full text-right bg-slate-50 focus:bg-white text-slate-800 text-sm pl-4 pr-10 py-2.5 rounded-xl border border-slate-200 focus:border-blue-500 outline-none transition-all" />
              </div>
            </div>
            <div className="flex flex-col text-right">
              <label className="text-xs font-semibold text-slate-700 mb-1.5">פלטפורמה</label>
              <div className="flex gap-2">
                {([['instagram', 'אינסטגרם', Instagram], ['facebook', 'פייסבוק', Facebook]] as const).map(([key, label, Icon]) => (
                  <button key={key} type="button" onClick={() => setPlatform(key)}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2.5 rounded-xl text-xs font-semibold border transition-all ${platform === key ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                    <Icon className="w-4 h-4" />{label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button type="submit" disabled={loading || !topic}
              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm px-6 py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs disabled:opacity-50">
              {loading ? (<><div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div><span>חוקר...</span></>) : (<><Hash className="w-4 h-4" /><span>בצע מחקר</span></>)}
            </button>
          </div>
        </form>
      </div>

      {loading && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 animate-pulse space-y-3">
          <div className="h-5 bg-slate-200 rounded w-1/4"></div>
          <div className="flex flex-wrap gap-2">{[...Array(10)].map((_, i) => <div key={i} className="h-6 w-20 bg-slate-100 rounded-md"></div>)}</div>
        </div>
      )}

      {!loading && result && (
        <div className="space-y-6">
          {/* Hashtags */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <button onClick={copyAll} className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-blue-600">
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}{copied ? 'הועתק' : 'העתק הכל'}
              </button>
              <div className="flex items-center gap-2 font-bold text-slate-800 text-sm"><span>האשטגים מומלצים</span><Hash className="w-4 h-4 text-blue-500" /></div>
            </div>
            <div className="flex flex-wrap gap-2 justify-end">
              {result.hashtags?.map((h, i) => (
                <span key={i} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border ${sizeBadge(h.size)}`} title={`${sizeLabel(h.size)} • ${h.estReach}`}>
                  <span className="opacity-60 text-[9px]">{sizeLabel(h.size)}</span>{h.tag}
                </span>
              ))}
            </div>
          </div>

          {/* Angles */}
          {result.angles?.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
              <div className="flex items-center gap-2 font-bold text-slate-800 text-sm mb-4 justify-end"><span>זוויות תוכן ופתיחים</span><Sparkles className="w-4 h-4 text-blue-500" /></div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {result.angles.map((a, i) => (
                  <div key={i} className="border border-slate-150 rounded-xl p-3 text-right bg-slate-50/50">
                    <div className="text-sm font-bold text-slate-800 mb-1">{a.angle}</div>
                    <div className="text-xs text-slate-600 italic">"{a.hook}"</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {result.bestTimes?.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
                <div className="flex items-center gap-2 font-bold text-slate-800 text-sm mb-3 justify-end"><span>חלונות פרסום מומלצים</span><Clock className="w-4 h-4 text-blue-500" /></div>
                <ul className="space-y-2 text-right">{result.bestTimes.map((t, i) => <li key={i} className="text-xs text-slate-600 flex items-start gap-2 justify-end"><span>{t}</span><span className="text-blue-400">•</span></li>)}</ul>
              </div>
            )}
            {result.contentPillars?.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
                <div className="flex items-center gap-2 font-bold text-slate-800 text-sm mb-3 justify-end"><span>עמודי תוכן (Pillars)</span><Layers className="w-4 h-4 text-blue-500" /></div>
                <ul className="space-y-2 text-right">{result.contentPillars.map((p, i) => <li key={i} className="text-xs text-slate-600 flex items-start gap-2 justify-end"><span>{p}</span><span className="text-blue-400">•</span></li>)}</ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
