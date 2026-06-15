import React, { useState } from 'react';
import { SocialCompetitor } from '../types';
import { Radar, Search, Users, Flame, Target, Sparkles, AtSign } from 'lucide-react';

interface SocialCompetitorSectionProps {
  loading: boolean;
  competitors: SocialCompetitor[];
  onAnalyze: (topic: string, handle: string) => Promise<void>;
}

export default function SocialCompetitorSection({ loading, competitors, onAnalyze }: SocialCompetitorSectionProps) {
  const [topic, setTopic] = useState('אימון רגשי לנוער והדרכת הורים');
  const [handle, setHandle] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic) return;
    onAnalyze(topic, handle);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col gap-1 text-right">
            <h2 className="font-display font-bold text-slate-800 text-lg">ניתוח מתחרים ברשתות החברתיות</h2>
            <p className="text-xs text-slate-500">איתור 3 מתחרים באותו קנה מידה (יוצרים עצמאיים), סגנון התוכן שלהם, מה עובד להם והיכן הפער שלך. נתונים מוערכים מסימנים פומביים.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col text-right">
              <label className="text-xs font-semibold text-slate-700 mb-1.5">נושא / נישה</label>
              <div className="relative">
                <Search className="absolute right-3.5 top-3 w-4.5 h-4.5 text-slate-400" />
                <input type="text" value={topic} onChange={(e) => setTopic(e.target.value)} required
                  className="w-full text-right bg-slate-50 focus:bg-white text-slate-800 text-sm pl-4 pr-10 py-2.5 rounded-xl border border-slate-200 focus:border-blue-500 outline-none transition-all" />
              </div>
            </div>
            <div className="flex flex-col text-right">
              <label className="text-xs font-semibold text-slate-700 mb-1.5">החשבון שלך (אופציונלי)</label>
              <div className="relative">
                <AtSign className="absolute right-3.5 top-3 w-4.5 h-4.5 text-slate-400" />
                <input type="text" value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@heartcompass3"
                  className="w-full text-right bg-slate-50 focus:bg-white text-slate-800 text-sm pl-4 pr-10 py-2.5 rounded-xl border border-slate-200 focus:border-blue-500 outline-none transition-all" />
              </div>
            </div>
          </div>
          <div className="pt-2 flex justify-end">
            <button type="submit" disabled={loading || !topic}
              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm px-6 py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs disabled:opacity-50">
              {loading ? (<><div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div><span>מנתח...</span></>) : (<><Radar className="w-4 h-4" /><span>נתח מתחרים</span></>)}
            </button>
          </div>
        </form>
      </div>

      {loading && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-200/80 p-5 animate-pulse space-y-3">
              <div className="h-5 bg-slate-200 rounded w-1/2"></div>
              <div className="h-3 bg-slate-100 rounded w-3/4"></div>
              <div className="h-16 bg-slate-50 rounded"></div>
            </div>
          ))}
        </div>
      )}

      {!loading && competitors.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {competitors.map((c, idx) => (
            <div key={idx} className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col transition-all hover:shadow-md hover:border-slate-300">
              <div className="flex items-start justify-between mb-3">
                <span className="px-2.5 py-1 bg-slate-50 text-slate-600 rounded-lg text-[11px] font-mono">{c.platform}</span>
                <div className="text-right">
                  <h4 className="font-display font-semibold text-slate-800 text-md">{c.name}</h4>
                  <span className="text-[11px] text-slate-400">{c.handle}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl mb-4 text-slate-700 text-center">
                <div className="border-l border-slate-200/60">
                  <span className="text-[10px] text-slate-500 block flex items-center justify-center gap-1"><Users className="w-3 h-3" />עוקבים (מוערך)</span>
                  <span className="text-sm font-display font-bold text-slate-800 font-mono">{c.estFollowers}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block">תדירות פרסום</span>
                  <span className="text-xs font-semibold text-slate-700">{c.postingFrequency}</span>
                </div>
              </div>

              <p className="text-xs text-slate-600 text-right mb-4 bg-blue-50/30 p-2.5 rounded-lg"><span className="font-bold text-slate-700">סגנון: </span>{c.contentStyle}</p>

              <div className="space-y-1 text-right mb-3">
                <div className="flex items-center gap-1.5 text-emerald-600 text-xs font-bold mb-1 justify-end"><span>מה עובד להם</span><Flame className="w-3.5 h-3.5" /></div>
                {c.strengths?.slice(0, 3).map((s, i) => <div key={i} className="flex items-start gap-1 text-slate-600 text-xs justify-end"><span>{s}</span><span className="text-emerald-500">•</span></div>)}
              </div>

              <div className="space-y-1 text-right mb-3">
                <div className="flex items-center gap-1.5 text-blue-600 text-xs font-bold mb-1 justify-end"><span>הפער / ההזדמנות שלך</span><Target className="w-3.5 h-3.5" /></div>
                {c.gaps?.slice(0, 3).map((g, i) => <div key={i} className="flex items-start gap-1 text-slate-600 text-xs justify-end"><span>{g}</span><span className="text-blue-500">•</span></div>)}
              </div>

              {c.winningFormats?.length > 0 && (
                <div className="mt-auto pt-3 border-t border-slate-100 text-right">
                  <div className="flex items-center gap-1.5 text-slate-700 text-[11px] font-semibold mb-1.5 justify-end"><span>פורמטים מנצחים</span><Sparkles className="w-3 h-3" /></div>
                  <div className="flex flex-wrap gap-1.5 justify-end">
                    {c.winningFormats.map((f, i) => <span key={i} className="bg-slate-100 text-slate-600 text-[11px] px-2 py-0.5 rounded-md">{f}</span>)}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
