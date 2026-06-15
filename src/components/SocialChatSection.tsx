import React, { useState, useRef, useEffect } from 'react';
import { SocialChatMessage } from '../types';
import { Send, MessagesSquare, Globe, Loader2 } from 'lucide-react';

interface SocialChatSectionProps {
  onSend: (message: string, history: SocialChatMessage[], useSearch: boolean) => Promise<string>;
}

const STARTERS = [
  'בנה לי תוכנית תוכן שבועית לאינסטגרם',
  'איך מגדילים מעורבות בלי לרדוף אחרי טרנדים?',
  'מה לכתוב בביו של העמוד?',
];

export default function SocialChatSection({ onSend }: SocialChatSectionProps) {
  const [messages, setMessages] = useState<SocialChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [useSearch, setUseSearch] = useState(false);
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);

  const send = async (text: string) => {
    const msg = text.trim();
    if (!msg || loading) return;
    const history = messages;
    setMessages((prev) => [...prev, { role: 'user', message: msg }]);
    setInput('');
    setLoading(true);
    try {
      const reply = await onSend(msg, history, useSearch);
      setMessages((prev) => [...prev, { role: 'model', message: reply }]);
    } catch (e: any) {
      setMessages((prev) => [...prev, { role: 'model', message: 'מצטער, הייתה שגיאה. נסה שוב.' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs flex flex-col h-[600px]">
      <div className="p-4 border-b border-slate-150 flex items-center justify-between">
        <label className="flex items-center gap-1.5 text-[11px] text-slate-500 cursor-pointer">
          <input type="checkbox" checked={useSearch} onChange={(e) => setUseSearch(e.target.checked)} className="accent-blue-600" />
          <Globe className="w-3.5 h-3.5" /> חיפוש חי
        </label>
        <div className="flex items-center gap-2 font-bold text-slate-800 text-sm"><span>חדר ייעוץ אסטרטג סושיאל</span><MessagesSquare className="w-4 h-4 text-blue-500" /></div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center gap-4 text-slate-400">
            <MessagesSquare className="w-10 h-10 text-slate-300" />
            <p className="text-sm">שאל כל שאלה על אסטרטגיית התוכן והרשתות של מצפן הלב.</p>
            <div className="flex flex-wrap gap-2 justify-center max-w-md">
              {STARTERS.map((s, i) => (
                <button key={i} onClick={() => send(s)} className="text-xs bg-slate-50 hover:bg-blue-50 hover:text-blue-700 text-slate-600 border border-slate-200 rounded-full px-3 py-1.5 transition-colors">{s}</button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-start' : 'justify-end'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-line leading-relaxed text-right ${m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-800'}`}>{m.message}</div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-end">
            <div className="bg-slate-100 text-slate-500 rounded-2xl px-4 py-2.5 text-sm flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />חושב...</div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="p-4 border-t border-slate-150 flex items-center gap-2">
        <button type="submit" disabled={loading || !input.trim()} className="bg-blue-600 hover:bg-blue-700 text-white p-2.5 rounded-xl disabled:opacity-50 transition-all shrink-0"><Send className="w-4 h-4" /></button>
        <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="כתוב הודעה..." dir="rtl"
          className="flex-1 text-right bg-slate-50 focus:bg-white text-slate-800 text-sm px-4 py-2.5 rounded-xl border border-slate-200 focus:border-blue-500 outline-none transition-all" />
      </form>
    </div>
  );
}
