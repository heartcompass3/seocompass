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

  const handleGeneratePosts = async (params: { slug?: string; topic?: string; platforms: SocialPlatform[]; goal?: string }) => {
    setPostsLoading(true); setError(null);
    try { setPosts((await post('/api/social/generate-posts', params)).result); }
    catch (e: any) { setError(e.message); }
    finally { setPostsLoading(false); }
  };

  const handleResearch = async (topic: string, platform: SocialPlatform) => {
    setResearchLoading(true); setError(null);
    try { setResearch((await post('/api/social/research-hashtags', { topic, platform })).result); }
    catch (e: any) { setError(e.message); }
    finally { setResearchLoading(false); }
  };

  const handleCompetitors = async (topic: string, handle: string) => {
    setCompLoading(true); setError(null);
    try {
      const data = await post('/api/social/competitor-social', { topic, handle });
      setCompetitors(Array.isArray(data.competitors) ? data.competitors : []);
    } catch (e: any) { setError(e.message); }
    finally { setCompLoading(false); }
  };

  const handleChatSend = async (message: string, history: SocialChatMessage[], useSearch: boolean) => {
    const data = await post('/api/social/chat', { message, chatHistory: history, useSearch });
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
