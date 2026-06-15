import React, { useState } from 'react';
import { GeneratedSocialPosts, SocialArticleRef, SocialPlatform } from '../types';
import { Instagram, Facebook, Sparkles, Copy, Check, Hash, Image as ImageIcon, LayoutGrid, FileText, Wand2 } from 'lucide-react';

interface SocialPostSectionProps {
  articles: SocialArticleRef[];
  loading: boolean;
  result: GeneratedSocialPosts | null;
  onGenerate: (params: { slug?: string; topic?: string; platforms: SocialPlatform[]; goal?: string }) => Promise<void>;
}

export default function SocialPostSection({ articles, loading, result, onGenerate }: SocialPostSectionProps) {
  const [mode, setMode] = useState<'article' | 'topic'>('article');
  const [slug, setSlug] = useState('');
  const [topic, setTopic] = useState('');
  const [goal, setGoal] = useState('');
  const [platforms, setPlatforms] = useState<SocialPlatform[]>(['instagram', 'facebook']);
  const [copied, setCopied] = useState<string | null>(null);

  const togglePlatform = (p: SocialPlatform) =>
    setPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (platforms.length === 0) return;
    if (mode === 'article' && !slug) return;
    if (mode === 'topic' && !topic) return;
    onGenerate({
      slug: mode === 'article' ? slug : undefined,
      topic: mode === 'topic' ? topic : undefined,
      platforms,
      goal,
    });
  };

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch { /* clipboard blocked */ }
  };

  return (
    <div id="social-post-section" className="space-y-6">
      {/* Input */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col gap-1 text-right">
            <h2 className="font-display font-bold text-slate-800 text-lg">מחולל פוסטים לרשתות מתוך המאמרים</h2>
            <p className="text-xs text-slate-500">
              בחר מאמר קיים מהאתר (או נושא חופשי), והמערכת תייצר פוסטים לאינסטגרם ולפייסבוק בקול של מצפן הלב, כולל פתיחים, האשטגים ורעיון ויזואלי.
            </p>
          </div>

          {/* Source mode toggle */}
          <div className="flex gap-2">
            <button type="button" onClick={() => setMode('article')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${mode === 'article' ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}>
              ממאמר קיים
            </button>
            <button type="button" onClick={() => setMode('topic')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${mode === 'topic' ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}>
              מנושא חופשי
            </button>
          </div>

          {mode === 'article' ? (
            <div className="flex flex-col text-right">
              <label className="text-xs font-semibold text-slate-700 mb-1.5">בחר מאמר ({articles.length} זמינים)</label>
              <div className="relative">
                <FileText className="absolute right-3.5 top-3 w-4.5 h-4.5 text-slate-400 pointer-events-none" />
                <select value={slug} onChange={(e) => setSlug(e.target.value)} required
                  className="w-full text-right bg-slate-50 focus:bg-white text-slate-800 text-sm pl-4 pr-10 py-2.5 rounded-xl border border-slate-200 focus:border-blue-500 outline-none transition-all appearance-none">
                  <option value="">— בחר מאמר —</option>
                  {articles.map((a) => (
                    <option key={a.slug} value={a.slug}>{a.title}</option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <div className="flex flex-col text-right">
              <label className="text-xs font-semibold text-slate-700 mb-1.5">נושא חופשי</label>
              <input type="text" value={topic} onChange={(e) => setTopic(e.target.value)}
                placeholder="למשל: איך לעצור ויכוח עם מתבגר לפני שהוא מתפוצץ" required
                className="w-full text-right bg-slate-50 focus:bg-white text-slate-800 text-sm px-4 py-2.5 rounded-xl border border-slate-200 focus:border-blue-500 outline-none transition-all" />
            </div>
          )}

          {/* Platforms */}
          <div className="flex flex-col text-right">
            <label className="text-xs font-semibold text-slate-700 mb-1.5">פלטפורמות</label>
            <div className="flex gap-2">
              {([['instagram', 'אינסטגרם', Instagram], ['facebook', 'פייסבוק', Facebook]] as const).map(([key, label, Icon]) => (
                <button key={key} type="button" onClick={() => togglePlatform(key)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${platforms.includes(key) ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'}`}>
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Goal */}
          <div className="flex flex-col text-right">
            <label className="text-xs font-semibold text-slate-700 mb-1.5">מטרת הפוסט (אופציונלי)</label>
            <input type="text" value={goal} onChange={(e) => setGoal(e.target.value)}
              placeholder="למשל: להניע לקריאת המאמר, או לפנייה בוואטסאפ"
              className="w-full text-right bg-slate-50 focus:bg-white text-slate-800 text-sm px-4 py-2.5 rounded-xl border border-slate-200 focus:border-blue-500 outline-none transition-all" />
          </div>

          <div className="pt-2 flex justify-end">
            <button type="submit" disabled={loading || platforms.length === 0}
              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm px-6 py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs disabled:opacity-50">
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                  <span>מייצר פוסטים...</span>
                </>
              ) : (
                <>
                  <Wand2 className="w-4 h-4" />
                  <span>ייצר פוסטים</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 animate-pulse space-y-4">
          <div className="h-6 bg-slate-200 rounded w-1/3"></div>
          <div className="h-24 bg-slate-50 rounded"></div>
          <div className="h-4 bg-slate-100 rounded w-2/3"></div>
        </div>
      )}

      {/* Results */}
      {!loading && result && (
        <div className="space-y-6">
          {result.sourceTitle && (
            <div className="flex items-center gap-2 text-slate-600 text-sm">
              <Sparkles className="w-4 h-4 text-blue-500" />
              <span>פוסטים שנוצרו עבור: <span className="font-bold text-slate-800">{result.sourceTitle}</span></span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {result.posts?.map((post, idx) => {
              const isIg = post.platform === 'instagram';
              const Icon = isIg ? Instagram : Facebook;
              const fullText = `${post.caption}\n\n${(post.hashtags || []).join(' ')}`;
              return (
                <div key={idx} className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <button onClick={() => copy(fullText, `cap-${idx}`)}
                      className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-blue-600 transition-colors">
                      {copied === `cap-${idx}` ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                      {copied === `cap-${idx}` ? 'הועתק' : 'העתק כיתוב'}
                    </button>
                    <div className={`flex items-center gap-2 font-bold text-sm ${isIg ? 'text-pink-600' : 'text-blue-600'}`}>
                      <span>{isIg ? 'אינסטגרם' : 'פייסבוק'}</span>
                      <Icon className="w-4.5 h-4.5" />
                    </div>
                  </div>

                  {/* Hook variations */}
                  {post.hookVariations?.length > 0 && (
                    <div className="mb-4 text-right">
                      <span className="text-xs font-semibold text-slate-700 block mb-1.5">פתיחים לבחירה (A/B):</span>
                      <div className="space-y-1.5">
                        {post.hookVariations.map((h, hi) => (
                          <div key={hi} className="text-sm text-slate-700 bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">{h}</div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Caption */}
                  <div className="mb-4 text-right">
                    <span className="text-xs font-semibold text-slate-700 block mb-1.5">כיתוב מלא:</span>
                    <p className="text-sm text-slate-800 whitespace-pre-line leading-relaxed bg-slate-50/50 rounded-lg p-3 border border-slate-100">{post.caption}</p>
                  </div>

                  {/* Hashtags */}
                  {post.hashtags?.length > 0 && (
                    <div className="mb-4 text-right">
                      <div className="flex items-center gap-1.5 text-slate-700 text-xs font-semibold mb-1.5">
                        <Hash className="w-3.5 h-3.5" /><span>האשטגים</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 justify-start">
                        {post.hashtags.map((t, ti) => (
                          <span key={ti} className="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-md">{t}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Visual idea */}
                  {post.visualIdea && (
                    <div className="mt-auto pt-3 border-t border-slate-100 text-right text-xs text-slate-600 flex items-start gap-2">
                      <ImageIcon className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                      <span><span className="font-bold text-slate-700">רעיון ויזואלי: </span>{post.visualIdea}</span>
                    </div>
                  )}
                  {post.cta && (
                    <div className="mt-2 text-right text-xs text-blue-600 font-semibold">{post.cta}</div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Carousel outline */}
          {result.carousel?.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
              <div className="flex items-center gap-2 text-slate-800 font-bold text-sm mb-4">
                <LayoutGrid className="w-4 h-4 text-blue-500" />
                <span>מבנה קרוסלה לאינסטגרם ({result.carousel.length} שקופיות)</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {result.carousel.map((s, si) => (
                  <div key={si} className="border border-slate-150 rounded-xl p-3 text-right bg-slate-50/50">
                    <div className="text-[10px] text-slate-400 font-mono mb-1">שקופית {si + 1}</div>
                    <div className="text-xs font-bold text-slate-800 mb-1">{s.slideTitle}</div>
                    <div className="text-[11px] text-slate-600 leading-relaxed">{s.slideText}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
