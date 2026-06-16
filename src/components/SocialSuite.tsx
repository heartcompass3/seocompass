import React, { useEffect, useState } from 'react';
import {
  GeneratedSocialPosts, SocialArticleRef, SocialPlatform,
  SocialResearch, SocialCompetitor, SocialChatMessage,
} from '../types';
import SocialPostSection from './SocialPostSection';
import HashtagSection from './HashtagSection';
import SocialCompetitorSection from './SocialCompetitorSection';
import SocialChatSection from './SocialChatSection';
import { Wand2, Hash, Radar, MessagesSquare, ShieldAlert } from 'lucide-react';

type SocialTab = 'posts' | 'hashtags' | 'competitors' | 'chat';

export default function SocialSuite() {
  const [tab, setTab] = useState<SocialTab>('posts');
  const [articles, setArticles] = useState<SocialArticleRef[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState('gemini-3.5-flash');

  // Post generator
  const [postsLoading, setPostsLoading] = useState(false);
  const [posts, setPosts] = useState<GeneratedSocialPosts | null>(null);

  // Hashtag research
  const [researchLoading, setResearchLoading] = useState(false);
  const [research, setResearch] = useState<SocialResearch | null>(null);

  // Competitor analysis
  const [compLoading, setCompLoading] = useState(false);
  const [competitors, setCompetitors] = useState<SocialCompetitor[]>([]);

  useEffect(() => {
    fetch('/api/social/articles')
      .then((r) => r.json())
      .then((d) => setArticles(Array.isArray(d.articles) ? d.articles : []))
      .catch(() => setArticles([]));
  }, []);

  const post = async (url: string, body: any) => {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'שגיאה');
    return data;
  };

  const handleGeneratePosts = async (params: { slug?: string; topic?: string; platforms: string[]; goal?: string }) => {
    setPostsLoading(true); setError(null);
    try { setPosts((await post('/api/social/generate-posts', { ...params, model })).result); }
    catch (e: any) { setError(e.message); }
    finally { setPostsLoading(false); }
  };

  const handleResearch = async (topic: string, platform: SocialPlatform, append = false) => {
    setResearchLoading(true); setError(null);
    try {
      const exclude = append && research ? research.hashtags.map((h) => h.tag) : [];
      const data: SocialResearch = (await post('/api/social/research-hashtags', { topic, platform, model, exclude })).result;
      setResearch((prev) =>
        append && prev
          ? { ...data, hashtags: [...prev.hashtags, ...(data.hashtags || [])], angles: [...prev.angles, ...(data.angles || [])] }
          : data
      );
    } catch (e: any) { setError(e.message); }
    finally { setResearchLoading(false); }
  };

  const handleCompetitors = async (topic: string, handle: string, append = false) => {
    setCompLoading(true); setError(null);
    try {
      const exclude = append ? competitors.map((c) => c.name) : [];
      const data = await post('/api/social/competitor-social', { topic, handle, model, exclude });
      const fresh: SocialCompetitor[] = Array.isArray(data.competitors) ? data.competitors : [];
      setCompetitors((prev) => (append ? [...prev, ...fresh] : fresh));
    } catch (e: any) { setError(e.message); }
    finally { setCompLoading(false); }
  };

  const handleChatSend = async (message: string, history: SocialChatMessage[], useSearch: boolean) => {
    const data = await post('/api/social/chat', { message, chatHistory: history, useSearch, model });
    return data.text || 'לא התקבלה תשובה.';
  };

  const tabs: { key: SocialTab; label: string; Icon: any }[] = [
    { key: 'posts', label: 'מחולל פוסטים מהמאמרים', Icon: Wand2 },
    { key: 'hashtags', label: 'מחקר האשטגים ונושאים', Icon: Hash },
    { key: 'competitors', label: 'ניתוח מתחרים', Icon: Radar },
    { key: 'chat', label: 'חדר ייעוץ סושיאל', Icon: MessagesSquare },
  ];

  return (
    <div className="space-y-6">
      {/* Model selector — switch to a higher-quota model if you hit 429 */}
      <div className="flex items-center justify-end gap-2">
        <span className="text-[11px] text-slate-400">מודל ה-AI:</span>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="bg-white text-slate-700 text-xs py-1.5 px-3 border border-slate-200 rounded-lg outline-none focus:border-blue-500"
        >
          <option value="gemini-3.5-flash">איכותי · 3.5 Flash (מומלץ לפוסטים)</option>
          <option value="gemini-3.1-flash-lite">חסכוני · Flash Lite (מכסה גבוהה)</option>
        </select>
      </div>

      <div className="border-b border-slate-200">
        <div className="flex space-x-2 space-x-reverse overflow-x-auto pb-px">
          {tabs.map(({ key, label, Icon }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`pb-3.5 px-4 text-xs font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                tab === key ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}>
              <Icon className="w-4 h-4" /><span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl border bg-rose-50 border-rose-200 text-rose-800 flex items-start gap-3 text-right">
          <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5 text-rose-500" />
          <p className="text-xs flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-xs opacity-50 hover:opacity-100 font-bold px-1">✕</button>
        </div>
      )}

      <div className="pt-2">
        {tab === 'posts' && (
          <SocialPostSection articles={articles} loading={postsLoading} result={posts} onGenerate={handleGeneratePosts} />
        )}
        {tab === 'hashtags' && (
          <HashtagSection loading={researchLoading} result={research} onSearch={handleResearch} />
        )}
        {tab === 'competitors' && (
          <SocialCompetitorSection loading={compLoading} competitors={competitors} onAnalyze={handleCompetitors} />
        )}
        {tab === 'chat' && (
          <SocialChatSection onSend={handleChatSend} />
        )}
      </div>
    </div>
  );
}
