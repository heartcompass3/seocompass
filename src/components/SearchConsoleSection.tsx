import React, { useState } from 'react';
import { fetchSearchConsoleData } from '../lib/firebaseHelper';
import { Search, RefreshCw, AlertCircle, LogIn, BarChart2, ExternalLink } from 'lucide-react';

interface GscRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface SearchConsoleSectionProps {
  googleToken: string | null;
  configured: boolean;        // VITE_GSC_SITE_URL is set (from /api/seo/status)
  onConnect: () => void;      // triggers Google sign-in (with the GSC scope)
}

export default function SearchConsoleSection({ googleToken, configured, onConnect }: SearchConsoleSectionProps) {
  const [rows, setRows] = useState<GscRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);

  const handleFetch = async () => {
    if (!googleToken) {
      onConnect();
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await fetchSearchConsoleData(googleToken, { rowLimit: 25 });
      setRows(data as GscRow[]);
      setLoaded(true);
    } catch (err: any) {
      console.error('Search Console fetch failed:', err);
      const msg = String(err?.message || '');
      if (msg.includes('insufficient') || msg.includes('PERMISSION') || msg.includes('403') || msg.includes('scope')) {
        setError('אין הרשאת Search Console בטוקן. התנתק והתחבר מחדש כדי לאשר את ההרשאה, וודא שהאתר מאומת תחת אותו חשבון.');
      } else {
        setError(msg || 'שליפת הנתונים נכשלה.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="search-console-section" className="space-y-6 text-right">
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2 justify-end flex-row-reverse border-b border-slate-200/60 pb-3">
          <Search className="w-5 h-5 text-blue-600" />
          <div>
            <h2 className="font-display font-bold text-slate-800 text-lg">נתוני אמת מ-Google Search Console</h2>
            <p className="text-xs text-slate-500">שאילתות, חשיפות, קליקים ומיקום ממוצע אמיתיים של האתר שלך ב-28 הימים האחרונים.</p>
          </div>
        </div>

        {/* Setup / connection state */}
        {!configured && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800 space-y-1.5">
            <p className="font-bold flex items-center gap-1.5 flex-row-reverse justify-end">
              <AlertCircle className="w-4 h-4" /> החיבור לא הוגדר
            </p>
            <p>הגדר את <span dir="ltr" className="font-mono">VITE_GSC_SITE_URL</span> (למשל <span dir="ltr" className="font-mono">sc-domain:heartcompass.vercel.app</span>) בסביבה, הפעל את "Google Search Console API" ב-Google Cloud, וודא שהאתר מאומת ב-Search Console תחת החשבון שאיתו אתה מתחבר.</p>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <button
            onClick={handleFetch}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-sm px-5 py-2.5 rounded-xl flex items-center gap-2 cursor-pointer shadow-xs transition-all"
          >
            {loading ? (
              <><RefreshCw className="w-4 h-4 animate-spin" /><span>טוען נתונים...</span></>
            ) : !googleToken ? (
              <><LogIn className="w-4 h-4" /><span>התחבר עם Google ואסוף נתונים</span></>
            ) : (
              <><BarChart2 className="w-4 h-4" /><span>{loaded ? 'רענן נתונים' : 'אסוף נתוני Search Console'}</span></>
            )}
          </button>

          <a
            href="https://search.google.com/search-console"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
          >
            <span>פתח את Search Console</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        {error && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs text-rose-700 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Results table */}
      {loaded && rows.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs overflow-x-auto">
          <table className="w-full text-xs text-right border-collapse">
            <thead>
              <tr className="text-slate-400 border-b border-slate-200">
                <th className="py-2 px-2 font-semibold">שאילתה</th>
                <th className="py-2 px-2 font-semibold">קליקים</th>
                <th className="py-2 px-2 font-semibold">חשיפות</th>
                <th className="py-2 px-2 font-semibold">CTR</th>
                <th className="py-2 px-2 font-semibold">מיקום ממוצע</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-2 px-2 font-medium text-slate-800">{r.keys?.[0]}</td>
                  <td className="py-2 px-2 text-slate-600 font-mono">{r.clicks}</td>
                  <td className="py-2 px-2 text-slate-600 font-mono">{r.impressions}</td>
                  <td className="py-2 px-2 text-slate-600 font-mono">{(r.ctr * 100).toFixed(1)}%</td>
                  <td className="py-2 px-2 text-slate-600 font-mono">{r.position?.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {loaded && rows.length === 0 && !error && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 text-center text-xs text-slate-400">
          לא נמצאו נתונים לטווח התאריכים. ייתכן שהאתר חדש או שעדיין אין מספיק תנועה.
        </div>
      )}
    </div>
  );
}
