import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { 
  initAuth, 
  googleSignIn, 
  logout,
  saveArticleToDrive,
  loadArticlesFromDrive,
  deleteArticleFromDrive
} from './lib/firebaseHelper';
import { 
  CompetitorAnalysis, 
  KeywordResearchResult, 
  GeneratedArticle 
} from './types';

// Components
import AuthBar from './components/AuthBar';
import CompetitorSection from './components/CompetitorSection';
import KeywordSection from './components/KeywordSection';
import ArticleSection from './components/ArticleSection';
import ExpertChatSection from './components/ExpertChatSection';
import SearchConsoleSection from './components/SearchConsoleSection';

// Icons
import { 
  ShieldAlert, 
  BarChart4, 
  SearchCode, 
  FileEdit, 
  Sparkles, 
  Flame, 
  Network,
  Cpu,
  Search
} from 'lucide-react';

// Prepopulated high-quality initial data on Israel Parenting Guidance & Youth Emotional Coaching niche
const INITIAL_COMPETITORS: CompetitorAnalysis[] = [
  {
    competitorName: "מכון אדלר (הכשרת והדרכת הורים)",
    websiteUrl: "m-adler.co.il",
    domainAuthority: 58,
    estimatedTraffic: "45K/month",
    trafficShare: 50,
    mainKeywords: ["הדרכת הורים", "מכון אדלר", "סמכות הורית", "טיפול בבעיות התנהגות", "סדנאות להורים"],
    strengths: ["מוניטין וסמכות מותג רבת שנים (E-E-A-T) מובילה בארץ", "פורטפוליו תוכן אקדמי ומאמרים רחב היקף", "פרופיל קישורים סמכותי מאתרים חדשותיים וממשלתיים"],
    weaknesses: ["היעדר ליווי והתאמה אישית דיגיטלית למתבגרים", "ממשק משתמש מיושן יחסית וקשה לניווט במובייל", "אי טיפול בביטויי זנב ארוך ממוקדים לדור ה-Z"],
    backlinkProfile: {
      strength: "High",
      estimatedCount: 4200,
      anchorTextStrategy: "שימוש נרחב בשם מותג ('מכון אדלר', 'אדלר הדרכה') ואנקורים מקצועיים לחלוטין."
    },
    onPageSEOStatus: {
      score: 72,
      mobileFriendly: true,
      pageSpeed: "Average",
      missingMetaTags: ["תג אלטרנטיבי חסר ב-35% מהתמונות", "עומס כותרות H1 כפולות בדפי הרשמה"]
    },
    contentStrategy: "מדריכים ארוכים המבוססים על תורה מסודרת, סיכומי מפגשים, וקורסים להורים מורשים ברחבי הארץ."
  },
  {
    competitorName: "מרכז קשרים למתבגרים",
    websiteUrl: "kesharim-parenting.co.il",
    domainAuthority: 34,
    estimatedTraffic: "15K/month",
    trafficShare: 30,
    mainKeywords: ["אימון רגשי לילדים", "אימון למתבגרים", "הורות לגיל ההתבגרות", "חרדות אצל נוער", "טיפול רגשי למתבגר"],
    strengths: ["נישה חדה וממוקדת ספציפית בעבודה עם קבוצות גיל שקשות לזיהוי", "דפי נחיתה אינטראקטיביים עם אופטימיזציית המרות טובה", "נוכחות חיובית במדיה חברתית המניעה תנועה חוזרת"],
    weaknesses: ["תוכן קצר ושטחי יחסית, היעדר מאמרים ארוכים (Pillar Content)", "איטיות טעינה חריגה בניידים בשל רזולוציית תמונות ווידאו כבדה", "חוסר מוחלט בסכמות שאלות נפוצות (FAQ Schema) בגוגל"],
    backlinkProfile: {
      strength: "Medium",
      estimatedCount: 950,
      anchorTextStrategy: "קישורים ממוקדי שירות מפוזרים בפורומי הורים ואינדקסים מקצועיים."
    },
    onPageSEOStatus: {
      score: 79,
      mobileFriendly: true,
      pageSpeed: "Slow",
      missingMetaTags: ["Meta Description חסר בכתבות הבלוג", "נייד חסר אופטימיזציית LCP"]
    },
    contentStrategy: "פוסטים שבועיים קצרים סביב שאלות הורים, המלצות של מטופלים, ופודקאסט שבועי קצר."
  },
  {
    competitorName: "המצפן הרגשי (האתר שלך)",
    websiteUrl: "heartcompass.vercel.app",
    domainAuthority: 18,
    estimatedTraffic: "2K/month",
    trafficShare: 20,
    mainKeywords: ["המצפן הרגשי", "אימון רגשי לנוער", "הדרכת הורים", "הדרכת הורים לגיל ההתבגרות", "אימון רגשי מתבגרים"],
    strengths: ["עיצוב ייחודי, נקי ומודרני המעניק ביטחון ואמפתיה מהירה", "מיקוד רגשי מדויק שפונה גם להורה וגם לנוער בגובה העיניים", "ציון מהירות וביצועים מעולים בארכיטקטורת Vercel"],
    weaknesses: ["דומיין צעיר יחסית הדורש הגדלת סמכות (DA)", "כמות מצומצמת של קישורים נכנסים (Backlinks) איכותיים בישראל", "היעדר כתבות עומק מותאמות SEO המשתלטות על ביטויי סל רחבים"],
    backlinkProfile: {
      strength: "Low",
      estimatedCount: 120,
      anchorTextStrategy: "אנקור מותגי בעיקר ('המצפן הרגשי', 'האתר של המצפן הרגשי')"
    },
    onPageSEOStatus: {
      score: 86,
      mobileFriendly: true,
      pageSpeed: "Fast",
      missingMetaTags: ["תג Schema לא מוגדר במלואו", "חסרות כתבות עמוד תווך (Pillar Content)"]
    },
    contentStrategy: "בלוג אישי ורגיש, אך דורש אסטרטגיה ועץ מילות מפתח מובנה לקבוצות ביטויי חיפוש אטרקטיביים עם קושי נמוך."
  }
];

const INITIAL_KEYWORDS: KeywordResearchResult[] = [
  {
    keyword: "אימון רגשי לנוער",
    searchVolume: 1600,
    difficulty: 28,
    cpc: 3.20,
    intent: "Commercial",
    kei: 20.4,
    seoValue: "High",
    relevanceToTopic: 10,
    suggestedAction: "כתיבת מאמר השוואתי (Pillar Content) המבדיל בין אימון רגשי לטיפול פסיכיאטרי או פסיכולוגי קלאסי."
  },
  {
    keyword: "הדרכת הורים למתבגרים",
    searchVolume: 2400,
    difficulty: 35,
    cpc: 2.50,
    intent: "Commercial",
    kei: 19.6,
    seoValue: "High",
    relevanceToTopic: 10,
    suggestedAction: "פרסום מדריך 'איך לתקשר רגישות עם בני נוער מבלי לעורר התנגדות' עם היררכיית כותרות H2/H3 חזקה."
  },
  {
    keyword: "איך להתמודד עם התפרצויות זעם של מתבגרים",
    searchVolume: 3200,
    difficulty: 18,
    cpc: 1.10,
    intent: "Informational",
    kei: 98.7,
    seoValue: "High",
    relevanceToTopic: 9,
    suggestedAction: "הפקת מאמר סופר-מפורט (Skyscraper) הכולל 5 כלים מעשיים, סכמת FAQ ותשובות קצרות להשגת Featured Snippet."
  },
  {
    keyword: "חרדות אצל מתבגרים טיפול",
    searchVolume: 1900,
    difficulty: 42,
    cpc: 4.80,
    intent: "Transactional",
    kei: 10.7,
    seoValue: "High",
    relevanceToTopic: 10,
    suggestedAction: "הקמת דף שירות ייעודי המשלב נורת אזהרה, שיח תומך והזמנה לקביעת פגישת אבחון ראשונית."
  },
  {
    keyword: "בעיות קשב וריכוז היבט רגשי",
    searchVolume: 1100,
    difficulty: 22,
    cpc: 1.90,
    intent: "Informational",
    kei: 22.7,
    seoValue: "Medium",
    relevanceToTopic: 8,
    suggestedAction: "פוסט בבלוג המסביר את הקשר בין חסך בקשב לתחושת בדידות ותסכול חברתי אצל מתבגרים."
  },
  {
    keyword: "משבר גיל ההתבגרות נורה אדומה",
    searchVolume: 850,
    difficulty: 14,
    cpc: 1.20,
    intent: "Informational",
    kei: 43.3,
    seoValue: "Medium",
    relevanceToTopic: 9,
    suggestedAction: "מאמר קצר עם טבלת מעקב להורים 'מתי מדובר בשינוי נורמטיבי ומתי נדרשת הכוונה חיצונית'."
  },
  {
    keyword: "המצפן הרגשי הדרכה ואימון",
    searchVolume: 350,
    difficulty: 5,
    cpc: 0.50,
    intent: "Navigational",
    kei: 140.0,
    seoValue: "High",
    relevanceToTopic: 10,
    suggestedAction: "אופטימיזציית מנוע החיפוש בדף הבית לדירוג מהיר ועדיף על שם המותג בארץ."
  },
  {
    keyword: "טיפול רגשי לנוער מומלץ",
    searchVolume: 1400,
    difficulty: 31,
    cpc: 3.60,
    intent: "Commercial",
    kei: 14.5,
    seoValue: "High",
    relevanceToTopic: 10,
    suggestedAction: "מאמר ממוקד הכולל מקרה בוחן אנונימי וסיפור הצלחה הממחיש את השינוי המשמעותי בסביבה המשפחתית."
  }
];

export default function App() {
  // Navigation
  const [activeTab, setActiveTab] = useState<'competitors' | 'keywords' | 'generator' | 'chat' | 'searchconsole'>('competitors');

  // Manual integration connection status (which slots are wired)
  const [integrations, setIntegrations] = useState<{ gemini: boolean; serpapi: boolean; searchConsole: boolean } | null>(null);
  
  // Auth state
  const [user, setUser] = useState<User | null>(null);
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Business state
  const [selectedKeywordForArticle, setSelectedKeywordForArticle] = useState('');
  const [competitors, setCompetitors] = useState<CompetitorAnalysis[]>(INITIAL_COMPETITORS);
  const [keywords, setKeywords] = useState<KeywordResearchResult[]>(INITIAL_KEYWORDS);
  const [generatedArticle, setGeneratedArticle] = useState<GeneratedArticle | null>(null);
  const [savedArticles, setSavedArticles] = useState<GeneratedArticle[]>([]);

  // Section loaders
  const [competitorsLoading, setCompetitorsLoading] = useState(false);
  const [keywordsLoading, setKeywordsLoading] = useState(false);
  const [articleLoading, setArticleLoading] = useState(false);

  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Load which manual connection slots are wired (Gemini / SerpApi / Search Console)
  useEffect(() => {
    fetch('/api/seo/status')
      .then((r) => r.json())
      .then(setIntegrations)
      .catch(() => setIntegrations(null));
  }, []);

  // Draft recovery: restore the last generated article on load so a page
  // refresh never loses work, even without Google Drive.
  useEffect(() => {
    try {
      const draft = localStorage.getItem('seocompass_draft');
      if (draft) setGeneratedArticle(JSON.parse(draft));
    } catch { /* ignore corrupt/blocked storage */ }
  }, []);

  // Persist the current article as a local draft whenever it changes.
  useEffect(() => {
    try {
      if (generatedArticle) {
        localStorage.setItem('seocompass_draft', JSON.stringify(generatedArticle));
      }
    } catch { /* ignore quota/blocked storage */ }
  }, [generatedArticle]);

  // Sync auth on load
  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser, token) => {
        setUser(currentUser);
        setGoogleToken(token);
        setNeedsAuth(false);
      },
      () => {
        setUser(null);
        setGoogleToken(null);
        setNeedsAuth(true);
      }
    );
    return () => unsubscribe();
  }, []);

  // Fetch articles from Google Drive on token change
  useEffect(() => {
    if (googleToken) {
      loadArticlesFromDrive(googleToken)
        .then(arts => setSavedArticles(arts))
        .catch(err => {
          console.error("Error loading articles from Google Drive:", err);
          // If token is expired or invalid, trigger re-auth
          setGoogleToken(null);
          setNeedsAuth(true);
        });
    } else {
      setSavedArticles([]);
    }
  }, [googleToken]);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    setNotification(null);
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setGoogleToken(result.accessToken);
        setNeedsAuth(false);
        setNotification({ type: 'success', message: 'התחברת בהצלחה ל-Google Drive! מעתה תוכל לשמור ולשלוף מאמרים ישירות בחשבון הדרייב שלך.' });
      }
    } catch (err: any) {
      console.error('Google Sign-In failed:', err);
      setNotification({ type: 'error', message: 'חיבור לחשבון גוגל נכשל. אנא בדוק את הרשאות הפופאפ.' });
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      setUser(null);
      setGoogleToken(null);
      setNeedsAuth(true);
      setNotification({ type: 'success', message: 'התנתקת בהצלחה.' });
    } catch (err: any) {
      console.error('Logout error:', err);
    }
  };

  const handleSaveToDriveLocal = async (article: GeneratedArticle) => {
    // The Google access token can be lost (e.g. after a page refresh) even while
    // the Firebase user session persists, which made saving fail while the UI
    // still showed "connected". If that happens, transparently re-acquire a
    // fresh token via a sign-in popup instead of just failing.
    let token = googleToken;
    if (!token) {
      const result = await googleSignIn();
      if (result) {
        token = result.accessToken;
        setUser(result.user);
        setGoogleToken(result.accessToken);
        setNeedsAuth(false);
      }
    }
    if (!token) throw new Error("יש להתחבר ל-Google Drive תחילה כדי לשמור מאמרים");
    const saved = await saveArticleToDrive(article, token);
    const updated = await loadArticlesFromDrive(token);
    setSavedArticles(updated);
    return saved;
  };

  const handleDeleteArticle = async (articleIdOrFileId: string) => {
    if (!googleToken) return;
    try {
      // Find file ID from saved articles list by ID or savedDriveFileId
      const targetArt = savedArticles.find(a => a.id === articleIdOrFileId || a.savedDriveFileId === articleIdOrFileId);
      const driveFileId = targetArt?.savedDriveFileId || articleIdOrFileId;
      
      if (!driveFileId) {
        throw new Error("מזהה הקובץ ב-Google Drive לא נמצא בקבוצת המאמרים שלך.");
      }
      
      await deleteArticleFromDrive(driveFileId, googleToken);
      const updated = await loadArticlesFromDrive(googleToken);
      setSavedArticles(updated);
      setNotification({ type: 'success', message: 'המאמר נמחק בהצלחה מחשבון ה-Google Drive שלך.' });
    } catch (err: any) {
      console.error("Delete article error:", err);
      setNotification({ type: 'error', message: 'מחיקת המאמר מ-Google Drive נכשלה.' });
    }
  };

  // 1. Competitor Analysis Fetch caller
  const handleAnalyzeCompetitors = async (targetUrl: string, topic: string) => {
    setCompetitorsLoading(true);
    setNotification(null);
    try {
      const response = await fetch('/api/seo/analyze-competitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUrl, topic }),
      });
      
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'שגיאה בניתוח המתחרים');
      }

      if (data.competitors && Array.isArray(data.competitors)) {
        setCompetitors(data.competitors);
        setNotification({ type: 'success', message: 'ניתוח המתחרים האורגני הושלם בהצלחה באמצעות כלי חיפוש גוגל חי.' });
      } else {
        throw new Error('התקבל פורמט לא תקין מהשרת.');
      }
    } catch (err: any) {
      console.error(err);
      setNotification({ type: 'error', message: err.message || 'ניתוח המתחרים נכשל. אנא בדוק את חיבור השרת.' });
    } finally {
      setCompetitorsLoading(false);
    }
  };

  // 2. Keyword Research Fetch caller
  const handleSearchKeywords = async (seedKeyword: string, topic: string) => {
    setKeywordsLoading(true);
    setNotification(null);
    try {
      const response = await fetch('/api/seo/search-keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seedKeyword, topic }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'שגיאה בחיפוש מילות מפתח');
      }

      if (data.keywords && Array.isArray(data.keywords)) {
        setKeywords(data.keywords);
        setNotification({ type: 'success', message: 'מחקר מילות המפתח המותאמות לגוגל הושלם בהרחבה.' });
      } else {
        throw new Error('התקבל פורמט לא תקין מהשרת.');
      }
    } catch (err: any) {
      console.error(err);
      setNotification({ type: 'error', message: err.message || 'חיפוש מילות מפתח נכשל. נסה שוב.' });
    } finally {
      setKeywordsLoading(false);
    }
  };

  // 3. Article Generator Fetch caller
  const handleGenerateArticle = async (formData: any) => {
    setArticleLoading(true);
    setNotification(null);
    try {
      const response = await fetch('/api/seo/generate-article', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'שגיאה בייצור המאמר האורגני');
      }

      if (data.article) {
        setGeneratedArticle(data.article);
        setNotification({ type: 'success', message: 'המאמר יוצר בהצלחה! השתמש בכלי העליון כדי לסנכרן עם גוגל דרייב.' });
        return data.article;
      } else {
        throw new Error('שגיאה במבנה התוכן מהמנוע.');
      }
    } catch (err: any) {
      console.error(err);
      setNotification({ type: 'error', message: err.message || 'ייצור המאמר נכשל.' });
      return null;
    } finally {
      setArticleLoading(false);
    }
  };

  // 4. Expert Chat Fetch coordinator
  const handleSendMessageToExpert = async (message: string, history: any[]) => {
    try {
      const formattedHistory = history.map(msg => ({
        role: msg.role,
        message: msg.message
      }));

      const response = await fetch('/api/seo/chat-expert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, chatHistory: formattedHistory }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'חדר הייעוץ לא מגיב');
      }
      return data.text || 'לא התקבלה תשובה מקצועית מהמודל.';
    } catch (err: any) {
      console.error(err);
      throw err;
    }
  };

  // Selected keyword linking workflow
  const linkKeywordToWriter = (kw: string) => {
    setSelectedKeywordForArticle(kw);
    setActiveTab('generator');
    setNotification({ type: 'success', message: `מילת המפתח שובצה במחולל המאמרים: "${kw}"` });
  };

  return (
    <div id="app-root" className="min-h-screen bg-slate-50 flex flex-col font-sans">
      
      {/* Outer elegant display header */}
      <header id="main-header" className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          
          {/* Logo brand and subtitle */}
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600 text-white rounded-xl shadow-sm shadow-blue-500/20">
              <Cpu className="w-5 h-5 animate-pulse" />
            </div>
            <div className="text-right">
              <h1 className="font-display font-black text-slate-800 text-md tracking-tight leading-none flex items-center gap-1.5">
                <span>סוויטת SEO אסטרטגית • Google Gemini</span>
                <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded-md text-[9px] font-bold">V2.0 PRO</span>
              </h1>
              <span className="text-[10px] text-slate-400 font-medium">כלי מחקר מתקדם, כתיבה חכמה וסנכרון ענן Firebase</span>
            </div>
          </div>

          {/* Live integration connection status — each is a manual slot you control */}
          <div className="hidden md:flex items-center gap-1.5" title="סטטוס חיבורים ידניים">
            {[
              { key: 'gemini', label: 'Gemini', on: integrations?.gemini },
              { key: 'serpapi', label: 'SerpApi', on: integrations?.serpapi },
              { key: 'searchConsole', label: 'Search Console', on: integrations?.searchConsole },
            ].map((i) => (
              <span
                key={i.key}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-semibold border ${
                  i.on
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-slate-50 text-slate-400 border-slate-200'
                }`}
              >
                <span className={`inline-block w-1.5 h-1.5 rounded-full ${i.on ? 'bg-emerald-500' : 'bg-slate-300'}`}></span>
                {i.label}
              </span>
            ))}
          </div>
        </div>
      </header>

      {/* Main Content Workspace layout */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        
        {/* Banner with general explanation */}
        <div className="bg-radial from-slate-900 via-slate-950 to-slate-950 text-white p-6 sm:p-8 rounded-3xl border border-slate-800 text-right space-y-3 relative overflow-hidden shadow-md">
          <div className="absolute top-0 left-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>
          
          <div className="flex items-center gap-2 text-indigo-400">
            <Sparkles className="w-4.5 h-4.5" />
            <span className="text-xs font-bold font-display uppercase tracking-widest">מערכת קבלת החלטות SEO חכמה</span>
          </div>
          
          <h2 className="font-display font-black text-xl sm:text-2xl tracking-tight leading-tight max-w-2xl">
            שדרג את הקידום האורגני שלך עם הדור הבא של בינה מלאכותית מבית גוגל
          </h2>
          
          <p className="text-xs text-slate-300 max-w-3xl leading-relaxed">
            שלב בין איתור מתחרים מדויק, השוואת סל מילות מפתח בעזרת מדד יעילות (KEI), ומחולל מאמרים אקדמי-שיווקי המייצא ישירות מאמרים מלאים ושמורים לענן Firebase. אנו משתמשים בטכנולוגיית סריקת אינטרנט מתקדמת תוך פנייה למנועי חיפוש בזמן אמת כדי להחליף את המדדים הסטטיים הישנים בתוצאות אמיתיות ואיכותיות.
          </p>
        </div>

        {/* Global Notifications system */}
        {notification && (
          <div 
            id="system-notification"
            className={`p-4 rounded-xl border flex items-start gap-3 text-right max-w-4xl mx-auto ${
              notification.type === 'success' 
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}
          >
            <ShieldAlert className={`w-5 h-5 shrink-0 mt-0.5 ${notification.type === 'success' ? 'text-emerald-600' : 'text-rose-500'}`} />
            <div className="flex-1">
              <p className="text-xs font-bold leading-none">{notification.type === 'success' ? 'הודעת מערכת בהצלחה' : 'שגיאת מערכת'}</p>
              <p className="text-[11px] mt-1 opacity-90">{notification.message}</p>
            </div>
            <button 
              onClick={() => setNotification(null)}
              className="text-xs opacity-50 hover:opacity-100 font-bold px-1"
            >
              ✕
            </button>
          </div>
        )}

        {/* Google OAuth Access status bar */}
        <AuthBar 
          user={user}
          needsAuth={needsAuth}
          isLoggingIn={isLoggingIn}
          onLogin={handleLogin}
          onLogout={handleLogout}
        />

        {/* Main Navigation tabs */}
        <div className="border-b border-slate-200">
          <div className="flex space-x-2 space-x-reverse overflow-x-auto pb-px" id="navigation-tabs">
            <button
              onClick={() => setActiveTab('competitors')}
              id="tab-competitors"
              className={`pb-3.5 px-4 text-xs font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'competitors' 
                  ? 'border-blue-600 text-blue-600' 
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <BarChart4 className="w-4 h-4" />
              <span>ניתוח מתחרים מקומי</span>
            </button>

            <button
              onClick={() => setActiveTab('keywords')}
              id="tab-keywords"
              className={`pb-3.5 px-4 text-xs font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'keywords' 
                  ? 'border-blue-600 text-blue-600' 
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <SearchCode className="w-4 h-4" />
              <span>מחקר ועץ מילות מפתח</span>
            </button>

            <button
              onClick={() => setActiveTab('generator')}
              id="tab-generator"
              className={`pb-3.5 px-4 text-xs font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'generator' 
                  ? 'border-blue-600 text-blue-600' 
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <FileEdit className="w-4 h-4" />
              <span>מחולל מאמרים אופטימליים</span>
            </button>

            <button
              onClick={() => setActiveTab('chat')}
              id="tab-chat"
              className={`pb-3.5 px-4 text-xs font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'chat' 
                  ? 'border-blue-600 text-blue-600' 
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Network className="w-4 h-4" />
              <span>חדר ייעוץ אסטרטג SEO</span>
            </button>

            <button
              onClick={() => setActiveTab('searchconsole')}
              id="tab-searchconsole"
              className={`pb-3.5 px-4 text-xs font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'searchconsole'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Search className="w-4 h-4" />
              <span>Search Console</span>
            </button>
          </div>
        </div>

        {/* Render Active View panels */}
        <div className="pt-2">
          {activeTab === 'competitors' && (
            <CompetitorSection 
              onAnalyze={handleAnalyzeCompetitors}
              loading={competitorsLoading}
              competitors={competitors}
            />
          )}

          {activeTab === 'keywords' && (
            <KeywordSection 
              onSearch={handleSearchKeywords}
              loading={keywordsLoading}
              keywords={keywords}
              onSelectKeywordForArticle={linkKeywordToWriter}
            />
          )}

          {activeTab === 'generator' && (
            <ArticleSection 
              selectedKeyword={selectedKeywordForArticle}
              onGenerateArticle={handleGenerateArticle}
              loading={articleLoading}
              user={user}
              onTriggerAuth={handleLogin}
              generatedArticle={generatedArticle}
              setGeneratedArticle={setGeneratedArticle}
              savedArticles={savedArticles}
              onSaveToFirestore={handleSaveToDriveLocal}
              onDeleteArticle={handleDeleteArticle}
            />
          )}

          {activeTab === 'chat' && (
            <ExpertChatSection
              onSendMessage={handleSendMessageToExpert}
            />
          )}

          {activeTab === 'searchconsole' && (
            <SearchConsoleSection
              googleToken={googleToken}
              configured={Boolean(integrations?.searchConsole)}
              onConnect={handleLogin}
            />
          )}
        </div>
      </main>

      {/* Styled system Footer block */}
      <footer id="system-footer" className="mt-12 bg-white border-t border-slate-200 py-6 text-center text-xs text-slate-450 text-slate-400">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="font-sans">סוויטת SEO אסטרטגית • מחוברת ל-Google Gemini API וסנכרון קבצי Google Drive API</p>
          <div className="flex items-center gap-4">
            <span className="font-mono">Status: Green</span>
            <span>•</span>
            <span className="font-mono">v2.1 Build</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
