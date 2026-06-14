import React, { useState, useEffect } from 'react';
import { GeneratedArticle } from '../types';
import { User } from 'firebase/auth';
import { Sparkles, FileText, CheckCircle, Save, HelpCircle, Eye, AlertCircle, RefreshCw, Trash2, Cloud, FileCode, Wand2, Gauge, Check, X, Copy, ClipboardCheck } from 'lucide-react';

interface ArticleSectionProps {
  selectedKeyword: string;
  onGenerateArticle: (formData: any) => Promise<GeneratedArticle | null>;
  loading: boolean;
  user: User | null;
  onTriggerAuth: () => void;
  generatedArticle: GeneratedArticle | null;
  setGeneratedArticle: (art: GeneratedArticle | null) => void;
  savedArticles: GeneratedArticle[];
  onSaveToFirestore: (article: GeneratedArticle) => Promise<any>;
  onDeleteArticle: (articleId: string) => Promise<void>;
}

interface AuditResult {
  score: number;
  readability: string;
  densityInfo: string;
  strengths: string[];
  recommendations: string[];
  checklist: Array<{ factor: string; passed: boolean }>;
}

// A single copy-to-clipboard field, mapped 1:1 to a Sanity `article` field name.
function CopyField({
  label,
  sanityField,
  value,
  mono,
  multiline,
}: {
  label: string;
  sanityField: string;
  value?: string;
  mono?: boolean;
  multiline?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error('Clipboard copy failed:', err);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3 text-right">
      <div className="flex items-center justify-between gap-2 mb-1.5 flex-row-reverse">
        <div className="flex items-center gap-1.5 flex-row-reverse">
          <span className="text-xs font-bold text-slate-700">{label}</span>
          <span className="text-[9px] font-mono bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded" dir="ltr">{sanityField}</span>
        </div>
        <button
          onClick={handleCopy}
          className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg transition-all cursor-pointer ${
            copied ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
          }`}
        >
          {copied ? <ClipboardCheck className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          <span>{copied ? 'הועתק' : 'העתק'}</span>
        </button>
      </div>
      <div
        dir="rtl"
        className={`whitespace-pre-wrap break-words text-slate-700 ${
          mono ? 'font-mono text-[11px] bg-slate-50 rounded-lg p-2 max-h-48 overflow-auto' : multiline ? 'text-xs leading-relaxed' : 'text-xs font-semibold'
        }`}
      >
        {value}
      </div>
    </div>
  );
}

// Client-side quality checks: HeartCompass brand-voice hard rules + SEO field
// lengths. Pure logic, no API calls.
function QualityChecks({ article }: { article: GeneratedArticle }) {
  const content = article.content || '';
  const combined = content + ' ' + (article.bodyHtml || '');
  const emDashes = (combined.match(/[—–]/g) || []).length;
  const formulaicPhrases = ['רבים מאיתנו', 'כולנו מכירים', 'האם גם אתם', 'בעולם של היום', 'מי מאיתנו לא', 'אין ספק ש'];
  const foundFormulaic = formulaicPhrases.filter((p) => content.includes(p));

  const metaTitleLen = (article.metaTitle || '').length;
  const metaDescLen = (article.metaDescription || '').length;
  const kw = (article.keyword || '').trim();
  const kwInTitle = !!kw && (article.title || '').includes(kw);
  const firstPara = content
    .split('\n')
    .map((s) => s.trim())
    .find((s) => s && !s.startsWith('#') && !s.startsWith('*') && !s.startsWith('-'));
  const kwInFirst = !!kw && !!firstPara && firstPara.includes(kw);

  const lenColor = (len: number, min: number, max: number) =>
    len === 0 ? 'text-slate-400' : len > max ? 'text-rose-600' : len < min ? 'text-amber-600' : 'text-emerald-600';

  const Row = ({ ok, label, detail }: { ok: boolean; label: string; detail?: string }) => (
    <div className="flex items-center justify-between gap-2 py-1 flex-row-reverse">
      <span className="text-xs text-slate-700">
        {label}
        {detail ? <span className="text-rose-500"> — {detail}</span> : null}
      </span>
      {ok ? <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> : <X className="w-3.5 h-3.5 text-rose-500 shrink-0" />}
    </div>
  );

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-3 text-right">
      <div className="flex items-center gap-2 border-b border-slate-200/60 pb-3 flex-row-reverse justify-end">
        <Gauge className="w-4.5 h-4.5 text-blue-600" />
        <h4 className="font-display font-bold text-slate-800 text-sm">בדיקות איכות — קול מותג ו-SEO</h4>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">
        <div>
          <p className="text-[10px] font-bold text-slate-400 mb-1">קול מותג (מצפן הלב)</p>
          <Row ok={emDashes === 0} label="בלי מקפים ארוכים" detail={emDashes ? `נמצאו ${emDashes}` : undefined} />
          <Row ok={foundFormulaic.length === 0} label="בלי פתיחות נוסחתיות" detail={foundFormulaic.length ? foundFormulaic.join(', ') : undefined} />
        </div>
        <div>
          <p className="text-[10px] font-bold text-slate-400 mb-1">SEO</p>
          <div className="flex items-center justify-between py-1 flex-row-reverse">
            <span className="text-xs text-slate-700">אורך כותרת מטא</span>
            <span className={`text-xs font-mono font-bold ${lenColor(metaTitleLen, 30, 60)}`}>{metaTitleLen}/60</span>
          </div>
          <div className="flex items-center justify-between py-1 flex-row-reverse">
            <span className="text-xs text-slate-700">אורך תיאור מטא</span>
            <span className={`text-xs font-mono font-bold ${lenColor(metaDescLen, 70, 155)}`}>{metaDescLen}/155</span>
          </div>
          <Row ok={kwInTitle} label="מילת המפתח בכותרת" />
          <Row ok={kwInFirst} label="מילת המפתח בפסקה הראשונה" />
        </div>
      </div>
    </div>
  );
}

export default function ArticleSection({
  selectedKeyword,
  onGenerateArticle,
  loading,
  user,
  onTriggerAuth,
  generatedArticle,
  setGeneratedArticle,
  savedArticles,
  onSaveToFirestore,
  onDeleteArticle
}: ArticleSectionProps) {
  const [keyword, setKeyword] = useState('');
  const [audience, setAudience] = useState('');
  const [tone, setTone] = useState('Professional');
  const [additionalKeywords, setAdditionalKeywords] = useState('');
  const [guidelines, setGuidelines] = useState('');
  const [useSearch, setUseSearch] = useState(false);
  const [genModel, setGenModel] = useState('gemini-3.5-flash');

  const [savingToFirestore, setSavingToFirestore] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState('');

  // AI Editor and Auditor States
  const [editPrompt, setEditPrompt] = useState('');
  const [selectedModel, setSelectedModel] = useState('gemini-3.5-flash');
  const [useSearchForEdit, setUseSearchForEdit] = useState(false);
  const [editingLoading, setEditingLoading] = useState(false);
  const [editError, setEditError] = useState('');
  const [editSuccess, setEditSuccess] = useState(false);

  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState('');
  const [activeSubConsole, setActiveSubConsole] = useState<'editor' | 'auditor'>('editor');

  useEffect(() => {
    if (selectedKeyword) {
      setKeyword(selectedKeyword);
    }
  }, [selectedKeyword]);

  // Reset local success alerts on article change
  useEffect(() => {
    setEditSuccess(false);
    setEditError('');
    setAuditResult(null);
  }, [generatedArticle]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyword) return;
    setSaveSuccess(false);
    setSaveError('');
    await onGenerateArticle({
      keyword,
      audience,
      tone,
      additionalKeywords,
      guidelines,
      useSearch,
      selectedModel: genModel
    });
  };

  // promptOverride lets the analyzer feed its recommendations straight into the
  // rewriter. typeof guard because React passes the click event when this is
  // used directly as an onClick handler.
  const handleEditArticle = async (promptOverride?: string) => {
    const override = typeof promptOverride === 'string' ? promptOverride : undefined;
    const effectivePrompt = (override ?? editPrompt).trim();
    if (!generatedArticle || !effectivePrompt) return;
    setEditingLoading(true);
    setEditError('');
    setEditSuccess(false);

    try {
      const response = await fetch('/api/seo/edit-article', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          article: generatedArticle,
          editPrompt: effectivePrompt,
          selectedModel,
          useSearch: useSearchForEdit
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'עריכת המאמר נכשלה');
      }

      if (data.article) {
        setGeneratedArticle(data.article);
        setEditSuccess(true);
        setEditPrompt('');
      } else {
        throw new Error('התקבל פורמט תגובה לא חוקי.');
      }
    } catch (err: any) {
      console.error(err);
      setEditError(err.message || 'שגיאת תקשורת זמנית.');
    } finally {
      setEditingLoading(false);
    }
  };

  const handleAnalyzeContent = async () => {
    if (!generatedArticle) return;
    setAuditLoading(true);
    setAuditError('');
    setAuditResult(null);

    try {
      const response = await fetch('/api/seo/analyze-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: generatedArticle.content,
          keyword: generatedArticle.keyword
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'שגיאה באנליזה');
      }

      if (data.audit) {
        setAuditResult(data.audit);
      } else {
        throw new Error('מבנה אנליזה לא תקין.');
      }
    } catch (err: any) {
      console.error(err);
      setAuditError(err.message || 'שגיאת רשת בשליחת האנליזה.');
    } finally {
      setAuditLoading(false);
    }
  };

  // Feed the analyzer's recommendations straight into the AI rewriter.
  const handleApplyRecommendations = async () => {
    if (!auditResult) return;
    const recs = auditResult.recommendations || [];
    const failed = (auditResult.checklist || []).filter(c => !c.passed).map(c => c.factor);
    if (recs.length === 0 && failed.length === 0) return;

    let prompt = 'שפר את המאמר כך שיעמוד בהמלצות ה-SEO הבאות, תוך שמירה על הקול, המבנה ומילת המפתח:\n';
    recs.forEach((r, i) => { prompt += `${i + 1}. ${r}\n`; });
    if (failed.length) {
      prompt += `\nבנוסף, תקן את הגורמים שנכשלו בבדיקה: ${failed.join('; ')}.`;
    }

    setEditPrompt(prompt);
    setActiveSubConsole('editor');
    await handleEditArticle(prompt);
  };

  const handleSaveToFirestoreLocal = async () => {
    if (!generatedArticle) return;
    if (!user) {
      onTriggerAuth();
      return;
    }

    setSavingToFirestore(true);
    setSaveError('');
    setSaveSuccess(false);

    try {
      // Ensure specific ID exists
      const articleId = generatedArticle.id || 'art_' + Date.now();
      const articleToSave: GeneratedArticle = {
        ...generatedArticle,
        id: articleId
      };
      
      const savedArticle = await onSaveToFirestore(articleToSave);
      setSaveSuccess(true);
      if (savedArticle) {
        setGeneratedArticle(savedArticle as any);
      } else {
        setGeneratedArticle(articleToSave);
      }
    } catch (err: any) {
      console.error(err);
      setSaveError(err.message || 'שגיאה בשמירת הקובץ בחשבון ה-Google Drive שלך');
    } finally {
      setSavingToFirestore(false);
    }
  };

  return (
    <div id="article-generator-section" className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Input Parameters & History List - Col 4 */}
        <div className="lg:col-span-4 space-y-6 text-right">
          
          {/* Main generator parameters form */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs h-fit">
            <div className="flex items-center gap-2 mb-4 justify-start flex-row-reverse">
              <Sparkles className="w-5 h-5 text-amber-500" />
              <h3 className="font-display font-bold text-slate-800 text-md">מחולל מאמרים מותאמי SEO</h3>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex flex-col">
                <label className="text-xs font-semibold text-slate-700 mb-1.5">מילת מפתח ראשית לייצור</label>
                <input 
                  type="text"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="למשל: איך להתמודד עם התפרצויות זעם של מתבגרים"
                  required
                  className="w-full text-right bg-slate-50 hover:bg-slate-100/50 focus:bg-white text-slate-800 text-sm px-3 py-2 rounded-xl border border-slate-200 focus:border-blue-500 outline-none transition-all"
                  id="article-keyword"
                />
                <span className="text-[10px] text-slate-400 mt-1">מילת המפתח תוטמע בכותרת, בכותרות המשנה, ובפסקה הראשונה</span>
              </div>

              <div className="flex flex-col">
                <label className="text-xs font-semibold text-slate-700 mb-1.5">קהל יעד מיועד (אופציונלי)</label>
                <input 
                  type="text"
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                  placeholder="למשל: הורים למתבגרים, מורים, אנשי חינוך"
                  className="w-full text-right bg-slate-50 hover:bg-slate-100/50 focus:bg-white text-slate-800 text-sm px-3 py-2 rounded-xl border border-slate-200 focus:border-blue-500 outline-none transition-all"
                  id="article-audience"
                />
              </div>

              <div className="flex flex-col">
                <label className="text-xs font-semibold text-slate-700 mb-1.5">סגנון וטון כתיבה</label>
                <select
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  className="w-full text-right bg-slate-50 hover:bg-slate-100/50 focus:bg-white text-slate-800 text-sm px-3 py-2 rounded-xl border border-slate-200 focus:border-blue-500 outline-none transition-all"
                  id="article-tone"
                >
                  <option value="Professional and informative">מקצועי וסמכותי (מומלץ)</option>
                  <option value="Casual and engaging">חברותי ופונה בגובה העיניים</option>
                  <option value="Selling and persuasive">שיווקי, משכנע ומניע לרכישה</option>
                  <option value="Creative and storytelling">יצירתי ומספר סיפור</option>
                </select>
              </div>

              <div className="flex flex-col">
                <label className="text-xs font-semibold text-slate-700 mb-1.5">מודל Gemini ליצירה</label>
                <select
                  value={genModel}
                  onChange={(e) => setGenModel(e.target.value)}
                  className="w-full text-right bg-slate-50 hover:bg-slate-100/50 focus:bg-white text-slate-800 text-sm px-3 py-2 rounded-xl border border-slate-200 focus:border-blue-500 outline-none transition-all"
                  id="article-gen-model"
                >
                  <option value="gemini-3.5-flash">gemini-3.5-flash (מהיר וכללי)</option>
                  <option value="gemini-3.1-pro-preview">gemini-3.1-pro-preview (עומק ומבנה מורכב)</option>
                  <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite (מהיר וחסכוני)</option>
                </select>
                {genModel === 'gemini-3.1-pro-preview' && (
                  <span className="text-[10px] text-amber-600 mt-1">מודל מתקדם — ודא שמפתחות החיוב מופעלים בחשבון.</span>
                )}
              </div>

              <div className="flex flex-col">
                <label className="text-xs font-semibold text-slate-700 mb-1.5">ביטויי מפתח משניים לשילוב (מופרדים בפסיק)</label>
                <input 
                  type="text"
                  value={additionalKeywords}
                  onChange={(e) => setAdditionalKeywords(e.target.value)}
                  placeholder="למשל: הדרכת הורים למתבגרים, אימון רגשי, ויסות רגשי"
                  className="w-full text-right bg-slate-50 hover:bg-slate-100/50 focus:bg-white text-slate-800 text-sm px-3 py-2 rounded-xl border border-slate-200 focus:border-blue-500 outline-none transition-all"
                  id="article-extra-keywords"
                />
              </div>

              <div className="flex flex-col">
                <label className="text-xs font-semibold text-slate-700 mb-1.5">הנחיות כתיבה נוספות (חופשי)</label>
                <textarea 
                  value={guidelines}
                  onChange={(e) => setGuidelines(e.target.value)}
                  placeholder="למשל: הדגש את חשיבות ההקשבה והכלה, ושלב פסקת סיכום חזקה עם קריאה לפעולה לקראת קביעת פגישת ייעוץ"
                  rows={3}
                  className="w-full text-right bg-slate-50 hover:bg-slate-100/50 focus:bg-white text-slate-800 text-sm px-3 py-2 rounded-xl border border-slate-200 focus:border-blue-500 outline-none transition-all"
                  id="article-guidelines"
                />
              </div>

              {/* Real-time Google Search Grounding toggle */}
              <div className="flex items-center gap-2 mb-2 flex-row-reverse justify-end bg-slate-50 border border-slate-150 p-2.5 rounded-xl">
                <input 
                  type="checkbox"
                  id="useSearch"
                  checked={useSearch}
                  onChange={(e) => setUseSearch(e.target.checked)}
                  className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500 cursor-pointer"
                />
                <label htmlFor="useSearch" className="text-xs font-semibold text-slate-700 cursor-pointer select-none flex-1">
                  הפעל חיפוש רשת חי (Search Grounding 🌍)
                </label>
              </div>

              <button
                type="submit"
                disabled={loading || !keyword}
                id="btn-generate-article"
                className="w-full bg-blue-600 hover:bg-blue-700 focus:ring-2 focus:ring-blue-500/20 text-white font-bold text-sm py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                    <span>מפיק מאמר אופטימלי...</span>
                  </>
                ) : (
                  <>
                    <FileText className="w-4 h-4" />
                    <span>ייצר מאמר מותאם SEO</span>
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Google Drive Saved Articles Manager Block */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
            <div className="flex items-center gap-2 mb-3 justify-start flex-row-reverse">
              <Cloud className="w-4 h-4 text-indigo-500" />
              <h4 className="font-display font-bold text-xs">מאמרים שמורים ב-Google Drive ({savedArticles.length})</h4>
            </div>

            {savedArticles.length === 0 ? (
              <p className="text-[11px] text-slate-400 text-center py-4">
                אין עדיין מאמרים שמורים. אנא התחבר, ייצר מאמר ושמור אותו ישירות בחשבון ה-Google Drive שלך.
              </p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {savedArticles.map((art) => (
                  <div 
                    key={art.id} 
                    className={`p-2.5 rounded-xl border text-xs flex items-center justify-between gap-1.5 transition-all text-right relative group ${
                      generatedArticle?.id === art.id 
                        ? 'bg-blue-50 border-blue-200' 
                        : 'bg-slate-50 hover:bg-slate-100 border-slate-200/60'
                    }`}
                  >
                    <div 
                      className="flex-1 cursor-pointer truncate pl-6 pr-1" 
                      onClick={() => setGeneratedArticle(art)}
                    >
                      <span className="font-bold text-slate-800 block truncate">{art.title}</span>
                      <span className="text-[10px] text-slate-400 block font-sans truncate">מילת מפתח: {art.keyword}</span>
                    </div>
                    
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm('האם אתה בטוח שברצונך למחוק מאמר זה מ-Google Drive?')) {
                          onDeleteArticle(art.id);
                          if (generatedArticle?.id === art.id) {
                            setGeneratedArticle(null);
                          }
                        }
                      }}
                      className="p-1 px-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors border border-transparent hover:border-rose-100"
                      title="מחק לצמיתות מהענן"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Output Presentation Screen - Col 8 */}
        <div className="lg:col-span-8 space-y-6 text-right">
          
          {/* Default blank / loading state */}
          {!loading && !generatedArticle && (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-8 text-center flex flex-col items-center justify-center min-h-[400px]">
              <div className="p-4 bg-slate-50 rounded-full text-slate-400 mb-4 border border-slate-100/60">
                <FileText className="w-8 h-8" />
              </div>
              <h4 className="font-display font-semibold text-slate-700 text-sm mb-1">המתין לייצור או טעינת התוכן</h4>
              <p className="text-xs text-slate-400 max-w-sm">
                מלא את הטופס מימין או בחר מילת מפתח ממחקר המילים, או טען מאמר קודם שסנכרנת לחשבון ה-Google Drive שלך כדי לצפות בו כאן.
              </p>
            </div>
          )}

          {/* Core Loading Loader state */}
          {loading && (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-8 text-center flex flex-col items-center justify-center min-h-[400px] animate-pulse">
              <div className="animate-spin p-4 bg-blue-50 rounded-full text-blue-500 mb-4 border border-blue-100/60">
                <RefreshCw className="w-8 h-8" />
              </div>
              <h4 className="font-display font-semibold text-slate-800 text-sm mb-1">מנוע הכתיבה של גוגל עובד בשבילך</h4>
              <p className="text-xs text-slate-400 max-w-sm animate-bounce">
                המאמר נבנה מראשי פרקים, כותרות אופטימליות H2/H3, שילוב מפתח, פיתוח FAQ אטרקטיבי ושיפור הסקיצות...
              </p>
            </div>
          )}

          {/* Complete Article Display layout */}
          {!loading && generatedArticle && (
            <div className="space-y-6">
              {/* Actions header control bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200/70 shadow-xs">
                <div>
                  <span className="text-[10px] text-slate-400 block font-mono">הושלם בהצלחה</span>
                  <h4 className="font-display font-bold text-slate-800 text-sm">{generatedArticle.title}</h4>
                </div>
                
                {/* Google Drive Cloud saving action button */}
                <div className="flex flex-wrap items-center gap-2">
                  {generatedArticle.savedDriveFileUrl && (
                    <a
                      href={generatedArticle.savedDriveFileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="px-4 py-2 text-xs font-semibold rounded-xl bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 flex items-center justify-center gap-1.5 transition-all text-right animate-fade-in"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>פתח ב-Google Drive</span>
                    </a>
                  )}

                  <button
                    onClick={handleSaveToFirestoreLocal}
                    disabled={savingToFirestore}
                    id="btn-save-to-firestore"
                    className={`px-4 py-2 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shadow-xs transition-all ${
                      savedArticles.some(a => a.id === generatedArticle.id || a.savedDriveFileId === generatedArticle.savedDriveFileId)
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                        : 'bg-indigo-600 text-white hover:bg-indigo-700'
                    }`}
                  >
                    {savingToFirestore ? (
                      <>
                        <div className="animate-spin rounded-full h-3 w-3 border-2 border-white border-t-transparent"></div>
                        <span>שומר ב-Google Drive...</span>
                      </>
                    ) : savedArticles.some(a => a.id === generatedArticle.id || a.savedDriveFileId === generatedArticle.savedDriveFileId) ? (
                      <>
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>נשמר ב-Google Drive ✓</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-3.5 h-3.5" />
                        <span>שמור ב-Google Drive</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Status notifications of saving results */}
              {saveSuccess && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
                  <div>
                    <h5 className="text-emerald-800 text-xs font-bold">המאמר נשמר וסונכרן בהצלחה ב-Google Drive!</h5>
                    <p className="text-emerald-700 text-[11px] mt-1">
                      המאמר נשמר כקובץ JSON אישי מאובטח ישירות בתיקיית הדרייב האישית שלך ונגיש עבורך בכל עת.
                    </p>
                  </div>
                </div>
              )}

              {saveError && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-rose-500 mt-0.5 shrink-0" />
                  <div>
                    <h5 className="text-rose-800 text-xs font-bold">שמירת הקובץ ב-Google Drive נכשלה</h5>
                    <p className="text-rose-700 text-[11px] mt-1">
                      {saveError.includes('permission') || saveError.includes('permissions')
                        ? 'אין הרשאה מתאימה לכתיבה. ודא שהתחברת בהצלחה לחשבונך במערכת.'
                        : saveError
                      }
                    </p>
                  </div>
                </div>
              )}

              {/* Client-side quality checks — brand voice + SEO lengths */}
              <QualityChecks article={generatedArticle} />

              {/* Sanity-ready fields panel — each field maps 1:1 to the Sanity `article` schema */}
              <div className="bg-white rounded-2xl border border-emerald-200/80 p-5 shadow-xs space-y-3 text-right">
                <div className="flex items-center gap-2 border-b border-slate-200/60 pb-3 flex-row-reverse justify-end">
                  <FileCode className="w-4.5 h-4.5 text-emerald-600" />
                  <div>
                    <h4 className="font-display font-bold text-slate-800 text-sm">שדות מוכנים להדבקה ב-Sanity (מסמך "מאמר")</h4>
                    <p className="text-[10px] text-slate-400">כל שדה ממופה לשם השדה ב-Sanity. העתק והדבק ידנית.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <CopyField label="כותרת ראשית" sanityField="title" value={generatedArticle.title} />
                  <CopyField label="שורת מסגור (זהב)" sanityField="goldLine" value={generatedArticle.goldLine} />
                  <CopyField label="Slug" sanityField="slug.current" value={generatedArticle.urlSlug} mono />
                  <CopyField label="תחומים" sanityField="tags" value={generatedArticle.tags?.join(', ')} />
                  <CopyField label="תקציר ענייני" sanityField="excerpt" value={generatedArticle.excerpt} multiline />
                  <CopyField label="שורת סמכות" sanityField="authorLine" value={generatedArticle.authorLine} />
                  <CopyField label="Alt לתמונה ראשית" sanityField="mainImage.alt" value={generatedArticle.imageAlt} multiline />
                  <CopyField label="משפט ציטוט למנוע (AEO)" sanityField="—" value={generatedArticle.aiCitation} multiline />
                </div>

                <CopyField label="גוף המאמר (HTML להדבקה)" sanityField="body" value={generatedArticle.bodyHtml} mono multiline />

                <p className="text-[10px] text-slate-400 leading-relaxed bg-slate-50 rounded-lg p-2.5">
                  שדות שנשארים לך למלא ידנית ב-Sanity: תמונה ראשית (<span dir="ltr" className="font-mono">mainImage</span>), מחבר (<span dir="ltr" className="font-mono">author</span>), תאריך פרסום (<span dir="ltr" className="font-mono">publishedAt</span>).
                  את גוף ה-HTML הדבק לתוך עורך התוכן של Sanity, והוא יומר אוטומטית ל-Portable Text.
                </p>
              </div>

              {/* 🔮 AI & SEO Control Console Panel */}
              <div className="bg-gradient-to-br from-indigo-900 via-slate-900 to-blue-950 text-white rounded-2xl p-6 shadow-md border border-indigo-500/20 space-y-5 text-right">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-white/10 pb-4 gap-4">
                  <div className="flex items-center gap-2 flex-row-reverse text-right">
                    <Sparkles className="w-5 h-5 text-amber-400 animate-pulse" />
                    <div>
                      <h4 className="font-display font-bold text-sm text-slate-100">קונסולת בינה מלאכותית ואנליזת SEO</h4>
                      <p className="text-[10px] text-indigo-200">ערוך, שכתב, שפר ובצע אנליזות מתקדמות לתוכן המאמר בעזרת Gemini</p>
                    </div>
                  </div>
                  
                  {/* Tab selection */}
                  <div className="flex items-center bg-white/5 p-1 rounded-lg border border-white/10 self-start sm:self-auto">
                    <button
                      onClick={() => setActiveSubConsole('editor')}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                        activeSubConsole === 'editor'
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      עורך ומשכתב AI
                    </button>
                    <button
                      onClick={() => setActiveSubConsole('auditor')}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                        activeSubConsole === 'auditor'
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      אנלייזר וציון SEO
                    </button>
                  </div>
                </div>

                {/* TAB 1: Smart AI Editor */}
                {activeSubConsole === 'editor' && (
                  <div className="space-y-4">
                    <div className="flex flex-col gap-1.5 text-right">
                      <label className="text-xs font-bold text-indigo-200">הנחיית שכתוב ועריכה ישירה ל-AI:</label>
                      <textarea
                        value={editPrompt}
                        onChange={(e) => setEditPrompt(e.target.value)}
                        placeholder="למשל: 'הוסף פסקה מעמיקה של 150 מילים בהתבסס על מחקר אחרון', 'שנה את טון הדיבור לשיווקי ומקצועי ועבה את ה-FAQ', 'תקן בעיות ניסוח ודקדוק'"
                        rows={3}
                        className="w-full text-right bg-white/5 hover:bg-white/10 focus:bg-white/10 border border-white/20 hover:border-white/30 focus:border-indigo-400 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-400 outline-none transition-all"
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Model Selector */}
                      <div className="flex flex-col gap-1.5 text-right">
                        <label className="text-xs font-bold text-indigo-200">בחירת מודל Google Gemini:</label>
                        <select
                          value={selectedModel}
                          onChange={(e) => setSelectedModel(e.target.value)}
                          className="w-full text-right bg-slate-900 border border-white/20 rounded-xl px-3 py-2 text-xs text-white focus:border-indigo-400 outline-none"
                        >
                          <option value="gemini-3.5-flash">gemini-3.5-flash (עריכות מהירות וכלליות - לא מצריך חיוב)</option>
                          <option value="gemini-3.1-pro-preview">gemini-3.1-pro-preview (משימות שכתוב ומבנה מורכבות)</option>
                          <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite (שינויים ותיקונים מהירים מקומיים)</option>
                        </select>
                        {selectedModel === 'gemini-3.1-pro-preview' && (
                          <span className="text-[10px] text-amber-300 mt-1">מודל מתקדם לניתוח עומק - ודא הפעלת מפתחות חיוב מתאימים.</span>
                        )}
                      </div>

                      {/* Tool selection: Search grounding */}
                      <div className="flex flex-col gap-1.5 text-right justify-center">
                        <span className="text-xs font-bold text-indigo-200 mb-1">כלי סריקה במקביל:</span>
                        <label className="flex items-center gap-2 justify-end cursor-pointer select-none text-xs text-slate-300">
                          <span className="flex-1">חפש ברשת בזמן אמת לביסוס השינויים (Google Grounding)</span>
                          <input
                            type="checkbox"
                            checked={useSearchForEdit}
                            onChange={(e) => setUseSearchForEdit(e.target.checked)}
                            className="w-4 h-4 text-blue-600 rounded border-white/20 focus:ring-opacity-40 cursor-pointer"
                          />
                        </label>
                      </div>
                    </div>

                    {editError && (
                      <div className="p-3 bg-rose-500/20 border border-rose-500/30 rounded-xl text-rose-200 text-[11px] text-right">
                        {editError}
                      </div>
                    )}

                    {editSuccess && (
                      <div className="p-3 bg-emerald-500/25 border border-emerald-500/40 rounded-xl text-emerald-200 text-[11px] text-right flex items-center gap-1.5 flex-row-reverse justify-end">
                        <Check className="w-3.5 h-3.5 shrink-0" />
                        <span>המאמר שוכתב ועודכן בהצלחה בעזרת ה-AI של גוגל! תוכל לשמור אותו שוב בפיירבייס.</span>
                      </div>
                    )}

                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        onClick={handleEditArticle}
                        disabled={editingLoading || !editPrompt.trim()}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-4 py-2.5 rounded-xl flex items-center gap-2 cursor-pointer disabled:opacity-40 transition-all border border-indigo-400/30"
                      >
                        {editingLoading ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>שולח בקשת שכתוב למודל...</span>
                          </>
                        ) : (
                          <>
                            <Wand2 className="w-3.5 h-3.5" />
                            <span>עדכן ושפר את המאמר בעזרת AI</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* TAB 2: SEO Auditor */}
                {activeSubConsole === 'auditor' && (
                  <div className="space-y-4">
                    <p className="text-xs text-slate-300 text-right">
                      בצע בדיקת עומק אלגוריתמית של הטקסט שייצרת. המערכת תנתח צפיפות ביטויים, קריאות, היררכיה, ותעניק חוזקות והמלצות מעשיות לקידום.
                    </p>

                    {auditError && (
                      <div className="p-3 bg-rose-500/20 border border-rose-500/30 rounded-xl text-rose-200 text-[11px] text-right">
                        {auditError}
                      </div>
                    )}

                    {!auditResult && !auditLoading && (
                      <div className="flex justify-end pt-2">
                        <button
                          onClick={handleAnalyzeContent}
                          className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-5 py-2.5 rounded-xl flex items-center gap-2 cursor-pointer transition-all border border-blue-400/30"
                        >
                          <Gauge className="w-3.5 h-3.5" />
                          <span>בצע ניתוח וציון SEO מקיף</span>
                        </button>
                      </div>
                    )}

                    {auditLoading && (
                      <div className="bg-white/5 border border-white/10 p-6 rounded-xl text-center flex flex-col items-center justify-center space-y-2">
                        <RefreshCw className="w-6 h-6 text-indigo-400 animate-spin" />
                        <span className="text-xs font-bold text-slate-200">סורק ומנתח סמנטיקה של תוכן המאמר...</span>
                      </div>
                    )}

                    {auditResult && (
                      <div className="space-y-4 text-right">
                        {/* Score Indicator Visual Header */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-white/5 p-4 rounded-xl border border-white/10 text-right">
                          <div className="col-span-1 flex flex-col items-center justify-center border-l md:border-l border-white/10 pl-4 py-2">
                            <span className="text-[10px] text-slate-400">ציון SEO</span>
                            <div className={`text-4xl font-extrabold mt-1 ${
                              auditResult.score >= 80 ? 'text-emerald-400' : auditResult.score >= 60 ? 'text-amber-400' : 'text-rose-400'
                            }`}>
                              {auditResult.score}
                            </div>
                            <span className="text-[9px] text-slate-300 font-mono">מתוך 100</span>
                          </div>

                          <div className="col-span-3 space-y-2 text-right">
                            <div>
                              <span className="text-[10px] text-slate-400 block">הערכת קריאות המאמר:</span>
                              <p className="text-xs text-slate-100 font-medium">{auditResult.readability}</p>
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400 block">צפיפות מילות מפתח:</span>
                              <p className="text-xs text-slate-200">{auditResult.densityInfo}</p>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Strengths */}
                          <div className="bg-slate-900/50 p-4 rounded-xl border border-white/10 text-right">
                            <h5 className="text-xs font-bold text-emerald-400 mb-2 flex items-center gap-1.5 flex-row-reverse justify-end">
                              <Check className="w-3.5 h-3.5 shrink-0" />
                              <span>נקודות חוזק SEO</span>
                            </h5>
                            <ul className="space-y-1.5 text-xs text-slate-200 list-disc list-inside">
                              {auditResult.strengths?.map((str, idx) => (
                                <li key={idx} className="leading-relaxed list-none pr-1">• {str}</li>
                              ))}
                            </ul>
                          </div>

                          {/* Recommendations */}
                          <div className="bg-slate-900/50 p-4 rounded-xl border border-white/10 text-right">
                            <h5 className="text-xs font-bold text-amber-400 mb-2 flex items-center gap-1.5 flex-row-reverse justify-end">
                              <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                              <span>משימות והמלצות לשיפור</span>
                            </h5>
                            <ul className="space-y-1.5 text-xs text-slate-200 list-decimal list-inside">
                              {auditResult.recommendations?.map((rec, idx) => (
                                <li key={idx} className="leading-relaxed list-none pr-1">{idx + 1}. {rec}</li>
                              ))}
                            </ul>
                          </div>
                        </div>

                        {/* Checklist */}
                        <div className="bg-slate-900/40 p-4 rounded-xl border border-white/5 space-y-2 text-right">
                          <h5 className="text-xs font-bold text-indigo-300">בדיקת קריטיות גורמים מבוצעת:</h5>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {auditResult.checklist?.map((item, idx) => (
                              <div key={idx} className="flex items-center justify-between bg-white/5 px-3 py-1.5 rounded-lg text-xs flex-row-reverse">
                                <span className="text-slate-300">{item.factor}</span>
                                {item.passed ? (
                                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded flex items-center gap-1">
                                    تקין <Check className="w-2.5 h-2.5" />
                                  </span>
                                ) : (
                                  <span className="text-[10px] bg-rose-500/20 text-rose-300 px-1.5 py-0.5 rounded flex items-center gap-1 flex-row-reverse">
                                    לפנות <X className="w-2.5 h-2.5" />
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="flex justify-end gap-2">
                          <button
                            onClick={handleApplyRecommendations}
                            disabled={editingLoading}
                            title="שולח את ההמלצות לעורך ה-AI ומשכתב את המאמר לפיהן"
                            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer border border-indigo-400/30"
                          >
                            {editingLoading ? (
                              <RefreshCw className="w-3 h-3 animate-spin" />
                            ) : (
                              <Wand2 className="w-3 h-3" />
                            )}
                            <span>שכתב את המאמר לפי ההמלצות</span>
                          </button>
                          <button
                            onClick={handleAnalyzeContent}
                            className="bg-white/10 hover:bg-white/20 text-white text-[11px] px-3 py-1.5 rounded-lg flex items-center gap-1 cursor-pointer"
                          >
                            <RefreshCw className="w-3 h-3" />
                            <span>רענן אנליזה</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Content Panel Box */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-6">
                
                {/* Meta details segment */}
                <div className="bg-slate-50 border border-slate-150/60 p-4 rounded-xl space-y-3">
                  <div className="flex items-center gap-2 border-b border-slate-200/60 pb-2 flex-row-reverse justify-end">
                    <Eye className="w-4 h-4 text-indigo-500" />
                    <span className="text-xs font-bold text-slate-700">אינפורמציית תגי מטא ו-SEO (Snippet Preview)</span>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    <div className="space-y-1">
                      <span className="text-slate-400 block font-sans">כותרת מטא (SEO Title):</span>
                      <span className="text-slate-800 font-semibold">{generatedArticle.metaTitle}</span>
                    </div>
                    <div className="space-y-1">
                      <span className="text-slate-400 block font-sans">כתובת אתר מומלצת (URL Slug):</span>
                      <span className="text-slate-600 font-mono text-[11px]">domain.co.il/blog/{generatedArticle.urlSlug}</span>
                    </div>
                    <div className="space-y-1 md:col-span-2 border-t border-slate-200/40 pt-2">
                      <span className="text-slate-400 block font-sans">תיאור מטא (Meta Description):</span>
                      <p className="text-slate-700 italic leading-snug">{generatedArticle.metaDescription}</p>
                    </div>
                  </div>
                </div>

                {/* Main Article Body Preview */}
                <div className="prose prose-slate max-w-none text-slate-800 space-y-4 leading-relaxed font-sans">
                  <h1 className="font-display font-bold text-slate-900 border-b border-slate-200 pb-3 text-2xl">
                    {generatedArticle.title}
                  </h1>
                  
                  <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono py-1 border-b border-slate-100">
                    <span>דירוג איכות SEO: High</span>
                    <span>ספירת מילים מוערכת: {generatedArticle.wordCount}</span>
                  </div>

                  {/* Render content headers and paragraphs cleanly */}
                  <div className="space-y-4 pt-2">
                    {generatedArticle.content.split('\n').map((para, pIdx) => {
                      const trimmed = para.trim();
                      if (!trimmed) return null;

                      if (trimmed.startsWith('###')) {
                        return <h3 key={pIdx} className="font-display font-semibold text-slate-800 text-md mt-6 mb-2">{trimmed.replace(/^###\s*/, '')}</h3>;
                      }
                      if (trimmed.startsWith('##')) {
                        return <h2 key={pIdx} className="font-display font-bold text-slate-800 text-lg mt-7 border-r-2 border-blue-500 pr-2.5 py-0.5 mb-3">{trimmed.replace(/^##\s*/, '')}</h2>;
                      }
                      if (trimmed.startsWith('#')) {
                        return <h2 key={pIdx} className="font-display font-bold text-slate-900 text-xl mt-8 mb-4">{trimmed.replace(/^#\s*/, '')}</h2>;
                      }
                      if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
                        return (
                          <div key={pIdx} className="flex items-start gap-2 text-sm text-slate-700 pl-4 py-0.5 pr-2">
                            <span className="text-blue-500 font-bold select-none">•</span>
                            <span>{trimmed.replace(/^(\*|-)\s*/, '')}</span>
                          </div>
                        );
                      }
                      
                      // Bold formatting replacements
                      let innerHTML = trimmed;
                      // Matches **text**
                      innerHTML = innerHTML.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

                      return (
                        <p 
                          key={pIdx} 
                          className="text-sm text-slate-700 leading-relaxed text-justify"
                          dangerouslySetInnerHTML={{ __html: innerHTML }}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* FAQ Schema display */}
                {generatedArticle.faqs && generatedArticle.faqs.length > 0 && (
                  <div className="bg-slate-50 border-r-4 border-indigo-500 p-4 rounded-xl mt-8 space-y-3">
                    <div className="flex items-center gap-2 flex-row-reverse justify-end">
                      <HelpCircle className="w-4.5 h-4.5 text-indigo-600" />
                      <h5 className="font-display font-bold text-indigo-900 text-sm">מבנה שאלות נפוצות מותאם לגוגל (FAQ Schema)</h5>
                    </div>

                    <div className="space-y-3 text-xs">
                      {generatedArticle.faqs.map((faq, fIdx) => (
                        <div key={fIdx} className="space-y-1">
                          <span className="font-bold text-indigo-950 block">❓ {faq.question}</span>
                          <p className="text-slate-600 pr-4 leading-relaxed">{faq.answer}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* SEO tips for this article */}
                {generatedArticle.seoTips && generatedArticle.seoTips.length > 0 && (
                  <div className="border-t border-slate-100 pt-6 space-y-3">
                    <h5 className="font-display font-bold text-slate-800 text-xs">המלצות המשך לקידום דף זה בגוגל ישראל</h5>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {generatedArticle.seoTips.map((tip, tIdx) => (
                        <div key={tIdx} className="flex items-start gap-2 text-xs text-slate-600 bg-amber-50/40 p-2.5 rounded-lg border border-amber-100/50">
                          <div className="px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded-md font-mono text-[9px] font-bold mt-0.5">
                            {tIdx + 1}
                          </div>
                          <p>{tip}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
