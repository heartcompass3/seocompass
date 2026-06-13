import React, { useState } from 'react';
import { KeywordResearchResult, SearchIntentType } from '../types';
import { Search, BrainCircuit, CheckSquare, Sparkles, Filter, Award, MousePointerClick, TrendingUp } from 'lucide-react';

interface KeywordSectionProps {
  onSearch: (seedKeyword: string, topic: string) => Promise<void>;
  loading: boolean;
  keywords: KeywordResearchResult[];
  onSelectKeywordForArticle: (keyword: string) => void;
}

export default function KeywordSection({ onSearch, loading, keywords, onSelectKeywordForArticle }: KeywordSectionProps) {
  const [seedKeyword, setSeedKeyword] = useState('אימון רגשי לנוער');
  const [topic, setTopic] = useState('הדרכת הורים');
  const [intentFilter, setIntentFilter] = useState<string>('All');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!seedKeyword) return;
    onSearch(seedKeyword, topic);
  };

  const filteredKeywords = intentFilter === 'All' 
    ? keywords 
    : keywords.filter(k => k.intent === intentFilter);

  // Intent badge styling helper
  const getIntentBadge = (intent: SearchIntentType) => {
    switch (intent) {
      case 'Informational':
        return <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-150 rounded-md text-[10px] font-semibold">מידע (Informational)</span>;
      case 'Transactional':
        return <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-150 rounded-md text-[10px] font-semibold">רכישה (Transactional)</span>;
      case 'Commercial':
        return <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-150 rounded-md text-[10px] font-semibold">חקירה (Commercial)</span>;
      case 'Navigational':
        return <span className="px-2 py-0.5 bg-purple-50 text-purple-700 border border-purple-150 rounded-md text-[10px] font-semibold">ניווט (Navigational)</span>;
      default:
        return <span className="px-2 py-0.5 bg-slate-50 text-slate-600 rounded-md text-[10px]">{intent}</span>;
    }
  };

  // Difficulty styling helper
  const getDifficultyColor = (diff: number) => {
    if (diff <= 33) return 'text-emerald-600 bg-emerald-50 border-emerald-100';
    if (diff <= 66) return 'text-amber-600 bg-amber-50 border-amber-100';
    return 'text-rose-600 bg-rose-50 border-rose-100';
  };

  return (
    <div id="keyword-research-section" className="space-y-6">
      {/* Search Bar Input */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col gap-1 text-right">
            <h2 className="font-display font-bold text-slate-800 text-lg">מחקר מילות מפתח מבוסס מגמות חיפוש חיות</h2>
            <p className="text-xs text-slate-500">
              הזן את המילה הראשית או נושא העסק. נעשה שימוש ב-Google Search Grounding ובאלגוריתם SEO לחישוב נפחי חיפוש, כוונות וקושי בגוגל ישראל.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col text-right">
              <label className="text-xs font-semibold text-slate-700 mb-1.5">ביטוי מפתח ראשי / מילת זרע</label>
              <div className="relative">
                <Search className="absolute right-3.5 top-3 w-4.5 h-4.5 text-slate-400" />
                <input 
                  type="text" 
                  value={seedKeyword}
                  onChange={(e) => setSeedKeyword(e.target.value)}
                  placeholder="למשל: אימון רגשי לנוער, הדרכת הורים" 
                  required
                  className="w-full text-right bg-slate-50 hover:bg-slate-100/50 focus:bg-white text-slate-800 text-sm pl-4 pr-10 py-2.5 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
                  id="keyword-seed"
                />
              </div>
            </div>

            <div className="flex flex-col text-right">
              <label className="text-xs font-semibold text-slate-705 mb-1.5 font-sans">נישה / קטגוריה תעשייתית (אופציונלי)</label>
              <div className="relative">
                <BrainCircuit className="absolute right-3.5 top-3 w-4.5 h-4.5 text-slate-400" />
                <input 
                  type="text" 
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="למשל: קואצ'ינג, גיל ההתבגרות, קליניקה" 
                  className="w-full text-right bg-slate-50 hover:bg-slate-100/50 focus:bg-white text-slate-800 text-sm pl-4 pr-10 py-2.5 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
                  id="keyword-niche"
                />
              </div>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={loading || !seedKeyword}
              id="submit-keyword-scan"
              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 focus:ring-2 focus:ring-blue-500/20 text-white font-semibold text-sm px-6 py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs disabled:opacity-50"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                  <span>מנתח מילות חיפוש ומגמות...</span>
                </>
              ) : (
                <>
                  <TrendingUp className="w-4 h-4" />
                  <span>בצע מחקר מילות מפתח מורחב</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Loading Skeletal */}
      {loading && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 animate-pulse space-y-4">
          <div className="h-6 bg-slate-200 rounded w-1/3"></div>
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-10 bg-slate-50 rounded"></div>
            ))}
          </div>
        </div>
      )}

      {/* Keywords Table Results */}
      {!loading && keywords.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
          {/* Header & Filter Row */}
          <div className="p-5 border-b border-slate-150/80 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-4 text-right">
            <div>
              <h3 className="font-display font-bold text-slate-800 text-md">רשימת מילות מפתח מוצעות וזנב ארוך</h3>
              <p className="text-xs text-slate-500">לחץ על מילת מפתח כלשהי כדי להעבירה מיד למחולל המאמרים האורגני</p>
            </div>
            {/* Filter */}
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-400 mr-2" />
              <select
                value={intentFilter}
                onChange={(e) => setIntentFilter(e.target.value)}
                className="bg-white text-slate-700 text-xs py-1.5 px-3 border border-slate-200 rounded-lg outline-none focus:border-blue-500 font-sans"
              >
                <option value="All">כל כוונות החיפוש</option>
                <option value="Informational">כוונת מידע (עשיר בתוכן)</option>
                <option value="Transactional">כוונת רכישה (מכירות)</option>
                <option value="Commercial">כוונת חקירה מסחרית</option>
                <option value="Navigational">כוונת ניווט מותגי</option>
              </select>
            </div>
          </div>

          {/* Table Container */}
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-slate-50/50 text-slate-500 text-xs font-semibold border-b border-slate-100">
                  <th className="p-4">מילת חיפוש מוצעת</th>
                  <th className="p-4 text-center">נפח חיפוש חודשי</th>
                  <th className="p-4 text-center">רמת קושי (Difficulty)</th>
                  <th className="p-4 text-center">עלות לקליק (CPC)</th>
                  <th className="p-4 text-center">כוונת החיפוש (Intent)</th>
                  <th className="p-4 text-center" title="נפח חיפוש חלקי קושי בריבוע (מדד יעילות)">מדד יעילות (KEI)</th>
                  <th className="p-4 text-center">ערך קידום (SEO)</th>
                  <th className="p-4 text-center">הנחיה אסטרטגית</th>
                  <th className="p-4 text-center">כלי עבודה</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredKeywords.map((kw, idx) => (
                  <tr 
                    key={idx} 
                    className="hover:bg-blue-50/30 transition-colors"
                  >
                    {/* Keyword */}
                    <td className="p-4 font-semibold text-slate-800">
                      <div className="flex items-center gap-2">
                        {kw.relevanceToTopic >= 8 && <Sparkles className="w-3.5 h-3.5 text-blue-500" title="רלוונטיות גבוהה מאוד" />}
                        <span>{kw.keyword}</span>
                      </div>
                    </td>

                    {/* Search Volume */}
                    <td className="p-4 text-center font-mono font-medium text-slate-800">
                      {kw.searchVolume.toLocaleString()}
                    </td>

                    {/* Difficulty */}
                    <td className="p-4 text-center">
                      <div className="flex flex-col items-center gap-1.5">
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-mono font-semibold border ${getDifficultyColor(kw.difficulty)}`}>
                          {kw.difficulty}%
                        </span>
                        {/* tiny line representation */}
                        <div className="w-16 bg-slate-100 h-1 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full ${
                              kw.difficulty <= 33 ? 'bg-emerald-500' :
                              kw.difficulty <= 66 ? 'bg-amber-500' : 'bg-rose-500'
                            }`}
                            style={{ width: `${kw.difficulty}%` }}
                          />
                        </div>
                      </div>
                    </td>

                    {/* CPC */}
                    <td className="p-4 text-center font-mono text-slate-700">
                      ${kw.cpc.toFixed(2)}
                    </td>

                    {/* Intent */}
                    <td className="p-4 text-center">
                      {getIntentBadge(kw.intent)}
                    </td>

                    {/* KEI Index */}
                    <td className="p-4 text-center font-mono font-semibold text-slate-800">
                      {kw.kei.toFixed(1)}
                    </td>

                    {/* Priority Value */}
                    <td className="p-4 text-center">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                        kw.seoValue === 'High' ? 'bg-emerald-100 text-emerald-800' :
                        kw.seoValue === 'Medium' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {kw.seoValue === 'High' ? 'קידום דחוף!' : kw.seoValue === 'Medium' ? 'מומלץ' : 'משני'}
                      </span>
                    </td>

                    {/* Suggested SEO Action steps */}
                    <td className="p-4 text-xs text-slate-600 max-w-xs text-right">
                      {kw.suggestedAction}
                    </td>

                    {/* Quick Trigger Tool button */}
                    <td className="p-4 text-center">
                      <button
                        onClick={() => onSelectKeywordForArticle(kw.keyword)}
                        id={`btn-select-keyword-${idx}`}
                        className="py-1 px-2.5 bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition-all mx-auto cursor-pointer border border-blue-100"
                        title="בחר מילה זו לייצור מאמר מותאם SEO"
                      >
                        <MousePointerClick className="w-3 h-3" />
                        <span>למחולל</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredKeywords.length === 0 && (
            <div className="p-8 text-center text-slate-400 text-sm">
              לא נמצאו מילות מפתח התואמות למסנן שנבחר
            </div>
          )}
        </div>
      )}
    </div>
  );
}
