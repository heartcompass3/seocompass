import React, { useState, useRef, useEffect } from 'react';
import { Send, User as UserIcon, Bot, Cpu, HelpCircle, GraduationCap, Globe } from 'lucide-react';

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  message: string;
}

interface ExpertChatSectionProps {
  onSendMessage: (message: string, history: ChatMessage[], useSearch: boolean) => Promise<string | null>;
}

export default function ExpertChatSection({ onSendMessage }: ExpertChatSectionProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'model',
      message: 'שלום! אני אסטרטג ה-SEO ומחקרי התחרות הבכיר שלך. יש לי גישה חיה לחיפוש גוגל כדי לנתח עדכוני אלגוריתם (Google Core Updates), פילוח מתחרים, תגיות קריטיות וביצוע אופטימיזציה לסמכות האתר שלך. שאל אותי כל שאלה אסטרטגית שתרצה!'
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [sending, setSending] = useState(false);
  // Live Google Search grounding. Off by default to save quota (grounding has a
  // tiny separate free-tier quota); turn on only for questions needing fresh data.
  const [useSearch, setUseSearch] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Suggestions for quick entry
  const promptSuggestions = [
    'כיצד להיערך לעדכוני האלגוריתם האחרונים של גוגל (Core Updates)?',
    'מהי אסטרטגיית בניית קישורים חיצוניים (Backlinks) הבטוחה ביותר היום?',
    'איך לשפר את ציון מהירות האתר ומדדי Core Web Vitals בצורה מושלמת?',
    'כיצד לחבר נכון בין מחקרי מילים לפוסטים בבלוג כדי למנוע קניבליזציה?'
  ];

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async (text: string) => {
    if (!text.trim() || sending) return;

    const userMsg: ChatMessage = {
      id: Math.random().toString(),
      role: 'user',
      message: text
    };

    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setSending(true);

    try {
      // Trigger API endpoint
      const responseText = await onSendMessage(text, messages, useSearch);
      
      const botMsg: ChatMessage = {
        id: Math.random().toString(),
        role: 'model',
        message: responseText || 'סליחה, אירעה שגיאה בעיבוד התשובה. אנא נסה שנית בשלב מאוחר יותר.'
      };

      setMessages(prev => [...prev, botMsg]);
    } catch (err: any) {
      console.error(err);
      const errMsg: ChatMessage = {
        id: Math.random().toString(),
        role: 'model',
        message: 'שגיאת תקשורת: ודא שמפתח ה-API שלך מחובר ושפתרון הרשת תקין.'
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div id="expert-chat-section" className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Suggestions and info - Col 4 */}
      <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs h-fit text-right">
        <div className="flex items-center gap-2 mb-3">
          <GraduationCap className="w-5 h-5 text-blue-600" />
          <h3 className="font-display font-semibold text-slate-800 text-sm">קונסולת ייעוץ אסטרטגית</h3>
        </div>
        
        <p className="text-xs text-slate-500 mb-4 leading-relaxed">
          מומלץ להתייעץ עם המודל על נושאים מורכבים. המנוע מפעיל סריקת רשת חיה כדי לבדוק מדדי אינדוקס, תעדוף עמודים והנחיות דירוג רשמיות של Google Search Central.
        </p>

        <span className="text-xs font-bold text-slate-700 block mb-2 leading-none">רעיונות ונושאים להתחלת שיחה:</span>
        <div className="flex flex-col gap-2">
          {promptSuggestions.map((sug, idx) => (
            <button
              key={idx}
              onClick={() => handleSend(sug)}
              disabled={sending}
              className="text-right text-xs p-2.5 bg-slate-50 hover:bg-blue-50/50 hover:text-blue-700 text-slate-600 border border-slate-100 rounded-xl transition-all cursor-pointer leading-tight disabled:opacity-50"
            >
              {sug}
            </button>
          ))}
        </div>
      </div>

      {/* Main Chat Box - Col 8 */}
      <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between h-[500px]">
        {/* Chat head */}
        <div className="p-4 border-b border-slate-150/80 bg-slate-50/50 flex items-center justify-between text-right">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center border border-blue-200/50">
              <Cpu className="w-4.5 h-4.5" />
            </div>
            <div>
              <h4 className="font-display font-semibold text-slate-800 text-sm leading-tight">חדר ייעוץ אסטרטג SEO בכיר</h4>
              <span className={`text-[10px] font-semibold flex items-center gap-1 leading-none mt-0.5 ${useSearch ? 'text-emerald-600' : 'text-slate-400'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${useSearch ? 'bg-emerald-500 animate-ping' : 'bg-slate-300'}`}></span>
                {useSearch ? 'חיפוש גוגל חי פעיל' : 'מצב חסכוני (בלי חיפוש חי)'}
              </span>
            </div>
          </div>
        </div>

        {/* Message body container */}
        <div 
          ref={scrollRef}
          className="p-4 flex-1 overflow-y-auto space-y-4"
          id="chat-messages-container"
        >
          {messages.map((msg) => (
            <div 
              key={msg.id}
              className={`flex gap-3 max-w-[85%] text-right ${msg.role === 'user' ? 'mr-auto flex-row-reverse' : 'ml-auto'}`}
            >
              {/* Avatar */}
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border ${
                msg.role === 'user' 
                  ? 'bg-indigo-50 border-indigo-150 text-indigo-600' 
                  : 'bg-emerald-50 border-emerald-150 text-emerald-600'
              }`}>
                {msg.role === 'user' ? <UserIcon className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
              </div>

              {/* Bubble */}
              <div className={`rounded-2xl p-3.5 text-xs leading-relaxed shadow-3xs ${
                msg.role === 'user'
                  ? 'bg-indigo-600 text-white rounded-tr-none'
                  : 'bg-slate-50 border border-slate-150/60 text-slate-800 rounded-tl-none whitespace-pre-wrap'
              }`}>
                {msg.message}
              </div>
            </div>
          ))}

          {sending && (
            <div className="flex gap-3 ml-auto text-right max-w-[85%]">
              <div className="w-8 h-8 rounded-full bg-emerald-50 border border-emerald-150 text-emerald-600 flex items-center justify-center">
                <Bot className="w-3.5 h-3.5" />
              </div>
              <div className="bg-slate-50 border border-slate-150/60 text-slate-800 p-3.5 rounded-2xl rounded-tl-none text-xs flex items-center gap-2">
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                </div>
                <span>מריץ שאילתת חיפוש ומגבש תובנות...</span>
              </div>
            </div>
          )}
        </div>

        {/* Input box */}
        <div className="p-3 border-t border-slate-150/80 bg-slate-50/30">
          <label className="flex items-center gap-2 justify-end cursor-pointer select-none mb-2 text-[11px] text-slate-500">
            <span className="flex items-center gap-1">
              <Globe className="w-3.5 h-3.5" />
              חיפוש גוגל חי (צורך מכסה, רק לשאלות על מידע עדכני)
            </span>
            <input
              type="checkbox"
              checked={useSearch}
              onChange={(e) => setUseSearch(e.target.checked)}
              className="w-3.5 h-3.5 text-blue-600 border-slate-300 rounded focus:ring-blue-500 cursor-pointer"
            />
          </label>
          <form
            onSubmit={(e) => { e.preventDefault(); handleSend(inputValue); }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              disabled={sending}
              placeholder="כתוב כאן שאילתה או התייעצות לגבי קידום האתר שלך..."
              className="flex-1 text-right bg-white text-slate-800 text-xs px-3 py-2.5 rounded-xl border border-slate-200 outline-none focus:border-blue-500 hover:border-slate-300 transition-all"
              id="chat-input"
            />
            
            <button
              type="submit"
              disabled={sending || !inputValue.trim()}
              id="chat-send-btn"
              className="p-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all disabled:opacity-40 cursor-pointer shadow-3xs"
            >
              <Send className="w-4 h-4 transform rotate-180" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
