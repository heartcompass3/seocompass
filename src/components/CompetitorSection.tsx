import React, { useState } from 'react';
import { CompetitorAnalysis } from '../types';
import { Search, Shield, Flame, ThumbsDown, CheckCircle, AlertTriangle, Cpu, Globe, BarChart2 } from 'lucide-react';

interface CompetitorSectionProps {
  onAnalyze: (targetUrl: string, topic: string) => Promise<void>;
  loading: boolean;
  competitors: CompetitorAnalysis[];
}

export default function CompetitorSection({ onAnalyze, loading, competitors }: CompetitorSectionProps) {
  const [targetUrl, setTargetUrl] = useState('https://heartcompass.vercel.app');
  const [topic, setTopic] = useState('הדרכת הורים ואימון רגשי לנוער');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetUrl && !topic) return;
    onAnalyze(targetUrl, topic);
  };

  return (
    <div id="competitor-section" className="space-y-6">
      {/* Search Console Input Block */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col gap-1 text-right">
            <h2 className="font-display font-bold text-slate-800 text-lg">ניתוח מתחרים אורגניים בגוגל ישראל</h2>
            <p className="text-xs text-slate-500">
              הזן את האתר שלך או הנושא המרכזי. המערכת תבצע חיפוש חי בגוגל (Search Grounding) לאיתור מתחרים ובניית מפה אסטרטגית מלאה.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col text-right">
              <label className="text-xs font-semibold text-slate-700 mb-1.5">כתובת האתר שלך (אופציונלי)</label>
              <div className="relative">
                <Globe className="absolute right-3.5 top-3 w-4.5 h-4.5 text-slate-400" />
                <input 
                  type="text" 
                  value={targetUrl}
                  onChange={(e) => setTargetUrl(e.target.value)}
                  placeholder="למשל: https://heartcompass.vercel.app" 
                  className="w-full text-right bg-slate-50 hover:bg-slate-100/50 focus:bg-white text-slate-800 text-sm pl-4 pr-10 py-2.5 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
                  id="competitor-url"
                />
              </div>
            </div>

            <div className="flex flex-col text-right">
              <label className="text-xs font-semibold text-slate-700 mb-1.5">הנושא או תחום הפעילות</label>
              <div className="relative">
                <Search className="absolute right-3.5 top-3 w-4.5 h-4.5 text-slate-400" />
                <input 
                  type="text" 
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="למשל: הדרכת הורים, אימון רגשי לנוער" 
                  required
                  className="w-full text-right bg-slate-50 hover:bg-slate-100/50 focus:bg-white text-slate-800 text-sm pl-4 pr-10 py-2.5 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
                  id="competitor-topic"
                />
              </div>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={loading || (!targetUrl && !topic)}
              id="submit-competitor-analysis"
              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 focus:ring-2 focus:ring-blue-500/20 text-white font-semibold text-sm px-6 py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs disabled:opacity-50"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                  <span>מנתח מתחרים בחיפוש חי...</span>
                </>
              ) : (
                <>
                  <Cpu className="w-4 h-4" />
                  <span>בצע סריקה וניתוח מתחרים</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Loading Skeletal state */}
      {loading && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 animate-pulse space-y-4">
          <div className="h-6 bg-slate-200 rounded w-1/4"></div>
          <div className="h-4 bg-slate-100 rounded w-2/3"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="border border-slate-100 rounded-xl p-4 space-y-3">
                <div className="h-5 bg-slate-200 rounded w-1/2"></div>
                <div className="h-3 bg-slate-100 rounded w-3/4"></div>
                <div className="space-y-1.5 pt-2">
                  <div className="h-3 bg-slate-100 rounded"></div>
                  <div className="h-3 bg-slate-100 rounded"></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Results Rendering */}
      {!loading && competitors.length > 0 && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-right">
            <div>
              <h3 className="font-display font-bold text-slate-800 text-lg">ממצאי מחקר מתחרים אורגניים</h3>
              <p className="text-xs text-slate-500">נמצאו 3 מתחרים דומיננטיים בגוגל לפי פילוח חיפוש עדכני</p>
            </div>
            {/* Visual stacked share */}
            <div className="w-full sm:w-64 bg-slate-100 h-2.5 rounded-full overflow-hidden flex">
              {competitors.map((comp, idx) => {
                const colors = ['bg-blue-600', 'bg-indigo-500', 'bg-violet-400'];
                return (
                  <div 
                    key={idx} 
                    className={`${colors[idx]} h-full`} 
                    style={{ width: `${comp.trafficShare}%` }}
                    title={`${comp.competitorName}: ${comp.trafficShare}%`}
                  />
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {competitors.map((comp, idx) => (
              <div 
                key={idx} 
                id={`competitor-card-${idx}`}
                className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col justify-between transition-all hover:shadow-md hover:border-slate-300"
              >
                <div>
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="px-2.5 py-1 bg-slate-50 text-slate-600 rounded-lg text-xs font-mono">
                      {comp.websiteUrl}
                    </div>
                    <div className="text-right">
                      <h4 className="font-display font-semibold text-slate-800 text-md">{comp.competitorName}</h4>
                      <span className="text-[10px] text-slate-400 block">מתחרה מוביל {idx + 1}</span>
                    </div>
                  </div>

                  {/* Visual Authority and Traffic */}
                  <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded-xl mb-4 text-slate-700">
                    <div className="text-center border-l border-slate-200/60 pl-2">
                      <span className="text-[10px] text-slate-500 block">סמכות דומיין (DA)</span>
                      <span className="text-lg font-display font-bold text-slate-800 font-mono">{comp.domainAuthority}</span>
                      <div className="w-full bg-slate-200 h-1 rounded-full mt-1 overflow-hidden">
                        <div className="bg-indigo-600 h-full rounded-full" style={{ width: `${comp.domainAuthority}%` }} />
                      </div>
                    </div>
                    <div className="text-center">
                      <span className="text-[10px] text-slate-500 block">תנועה חודשית מוערכת</span>
                      <span className="text-sm font-display font-bold text-slate-800 font-mono mt-0.5 block">{comp.estimatedTraffic}</span>
                      <span className="text-[10px] text-blue-500 font-semibold">{comp.trafficShare}% נתח שוק</span>
                    </div>
                  </div>

                  {/* Main Keywords */}
                  <div className="mb-4 text-right">
                    <span className="text-xs font-semibold text-slate-700 block mb-1.5">מוביל במילות מפתח:</span>
                    <div className="flex flex-wrap gap-1.5 justify-start">
                      {comp.mainKeywords && comp.mainKeywords.map((kw, kwIdx) => (
                        <span 
                          key={kwIdx}
                          className="bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs px-2 py-0.5 rounded-md transition-colors"
                        >
                          {kw}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Core strengths and weaknesses */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div className="space-y-1 text-right">
                      <div className="flex items-center gap-1.5 text-emerald-600 text-xs font-bold mb-1">
                        <Flame className="w-3.5 h-3.5" />
                        <span>נקודות חוזק:</span>
                      </div>
                      {comp.strengths && comp.strengths.slice(0, 3).map((st, sidx) => (
                        <div key={sidx} className="flex items-start gap-1 text-slate-600 text-xs">
                          <span className="text-emerald-500 select-none">•</span>
                          <span>{st}</span>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-1 text-right">
                      <div className="flex items-center gap-1.5 text-rose-500 text-xs font-bold mb-1">
                        <ThumbsDown className="w-3.5 h-3.5" />
                        <span>נקודות חולשה (הזדמנות):</span>
                      </div>
                      {comp.weaknesses && comp.weaknesses.slice(0, 3).map((wk, sidx) => (
                        <div key={sidx} className="flex items-start gap-1 text-slate-600 text-xs">
                          <span className="text-rose-400 select-none">•</span>
                          <span>{wk}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Backlink Profile summary */}
                  <div className="border-t border-slate-100 pt-3 text-right">
                    <span className="text-xs font-semibold text-slate-700 block mb-1">פרופיל קישורים (Backlinks):</span>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-1">
                        <span className="font-bold text-slate-800 font-mono">
                          {comp.backlinkProfile.estimatedCount ? comp.backlinkProfile.estimatedCount.toLocaleString() : '0'}
                        </span>
                        <span className="text-slate-400">קישורים</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400">חוזק:</span>
                        <span className={`px-2 py-0.5 rounded-md font-semibold text-[10px] ${
                          comp.backlinkProfile.strength === 'High' ? 'bg-amber-50 text-amber-700 border border-amber-150' : 
                          comp.backlinkProfile.strength === 'Medium' ? 'bg-sky-50 text-sky-700 border border-sky-150' : 
                          'bg-slate-50 text-slate-600'
                        }`}>
                          {comp.backlinkProfile.strength === 'High' ? 'חזק מאוד' : comp.backlinkProfile.strength === 'Medium' ? 'בינוני' : 'נמוך'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Technical On-Page Checklist */}
                  <div className="bg-slate-50/50 p-3 rounded-xl border border-slate-100 mt-4 space-y-2 text-right">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">בריאות טכנית ועמודית (On-page)</span>
                      <span className={`font-mono font-bold ${
                        comp.onPageSEOStatus.score >= 80 ? 'text-emerald-600' :
                        comp.onPageSEOStatus.score >= 60 ? 'text-amber-600' : 'text-rose-500'
                      }`}>
                        {comp.onPageSEOStatus.score}/100
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600">
                      <div className="flex items-center gap-1">
                        {comp.onPageSEOStatus.mobileFriendly ? (
                          <CheckCircle className="w-3 h-3 text-emerald-500" />
                        ) : (
                          <AlertTriangle className="w-3 h-3 text-rose-500" />
                        )}
                        <span>מותאם למובייל</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-slate-400">מהירות:</span>
                        <span className={`font-semibold ${
                          comp.onPageSEOStatus.pageSpeed === 'Fast' ? 'text-emerald-600' :
                          comp.onPageSEOStatus.pageSpeed === 'Average' ? 'text-amber-600' : 'text-rose-500'
                        }`}>
                          {comp.onPageSEOStatus.pageSpeed === 'Fast' ? 'מהיר' : comp.onPageSEOStatus.pageSpeed === 'Average' ? 'בינוני' : 'איטי'}
                        </span>
                      </div>
                    </div>

                    {comp.onPageSEOStatus.missingMetaTags.length > 0 && (
                      <div className="text-[10px] text-rose-500 border-t border-slate-200/50 pt-1.5">
                        <span className="font-semibold select-none">שגיאות בולטות: </span>
                        <span>{comp.onPageSEOStatus.missingMetaTags.join(', ')}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Content Strategy Quote */}
                <div className="mt-4 pt-3 border-t border-slate-100 text-right bg-blue-50/20 p-2.5 rounded-lg text-xs italic text-slate-600">
                  <span className="font-bold text-slate-700 not-italic block mb-0.5">אסטרטגיית תוכן:</span>
                  {comp.contentStrategy}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
