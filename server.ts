import express from "express";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
// NOTE: `vite` is a devDependency and must NEVER appear in this module's graph.
// On Vercel, api/index.ts imports this file as a serverless function; any
// reference to "vite" (even a dynamic import) gets bundled by @vercel/node and
// crashes the function at load ("A server error has occurred"). The Vite dev
// server therefore lives entirely in a separate file, dev-server.ts.

dotenv.config();

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

app.use(express.json({ limit: "10mb" }));

// Initialize the official Gemini SDK
// Always use the standard environment variable GEMINI_API_KEY
const geminiApiKey = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;

if (geminiApiKey) {
  ai = new GoogleGenAI({
    apiKey: geminiApiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
} else {
  console.warn("WARNING: GEMINI_API_KEY is not defined in the environment. AI capabilities will be disabled.");
}

// Ensure AI client is available helper
function getAIClient() {
  if (!ai) {
    throw new Error("מפתח ה-API של גוגל (GEMINI_API_KEY) חסר. אנא הגדר אותו בהגדרות המערכת.");
  }
  return ai;
}

// Ensure clean JSON string parsing from Gemini response
function parseJSONResponse(text: string) {
  try {
    // Try straightforward parsing
    return JSON.parse(text);
  } catch (err) {
    // If it contains markdown code blocks
    const match = text.match(/```json\s*([\s\S]*?)\s*```/);
    if (match && match[1]) {
      try {
        return JSON.parse(match[1].trim());
      } catch (e2) {
        throw new Error("קבלת הנתונים נכשלה עקב שגיאת מבנה פנימית. אנא נסה שוב.");
      }
    }
    
    // Fallback: try finding first '{' and last '}'
    const firstBrace = text.indexOf("[");
    const lastBrace = text.lastIndexOf("]");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(text.substring(firstBrace, lastBrace + 1));
      } catch (e3) {
        // Try object fallback
        const firstObj = text.indexOf("{");
        const lastObj = text.lastIndexOf("}");
        if (firstObj !== -1 && lastObj !== -1 && lastObj > firstObj) {
          try {
            return JSON.parse(text.substring(firstObj, lastObj + 1));
          } catch (e4) {
            // continue
          }
        }
      }
    }
    
    throw new Error("המערכת לא הצליחה לקרוא את מבנה הנתונים. אנא נסה שנית.");
  }
}

// Run a Gemini call with automatic fallback to a lighter, higher-quota model
// on 429 / quota errors. Grounding tools (googleSearch) have a tiny separate
// free-tier quota, so the retry also drops them.
async function generateWithFallback(
  client: GoogleGenAI,
  args: { model: string; contents: any; config?: any }
) {
  const FALLBACK = "gemini-3.1-flash-lite";
  try {
    return await client.models.generateContent(args);
  } catch (err: any) {
    const msg = String(err?.message || err);
    const isQuota = err?.status === 429 || /429|RESOURCE_EXHAUSTED|quota|rate.?limit/i.test(msg);
    if (!isQuota) throw err;
    const retryConfig = { ...(args.config || {}) };
    delete (retryConfig as any).tools;
    return await client.models.generateContent({
      model: FALLBACK,
      contents: args.contents,
      config: retryConfig,
    });
  }
}

// Turn a raw provider error into a friendly Hebrew message (esp. quota/429).
function friendlyError(err: any): string {
  const msg = String(err?.message || err || "");
  if (err?.status === 429 || /429|RESOURCE_EXHAUSTED|quota|rate.?limit/i.test(msg)) {
    return "המכסה של Gemini נוצלה כרגע. עבור ל'מודל חסכוני · Flash Lite' בבורר המודל למעלה, או בדוק את מגבלות/חיוב ה-API. אפשר גם לנסות שוב בעוד דקה.";
  }
  return msg || "שגיאה לא צפויה";
}

// Fetch live Google Israel SERP results via SerpApi (https://serpapi.com).
// Returns null when no SERPAPI_KEY is configured so callers can fall back to
// a Gemini-only flow. Throws on an actual API/network error.
async function fetchSerpResults(query: string) {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey || !query) return null;

  const params = new URLSearchParams({
    engine: "google",
    q: query,
    google_domain: "google.co.il",
    gl: "il",
    hl: "he",
    num: "10",
    api_key: apiKey,
  });

  const resp = await fetch(`https://serpapi.com/search.json?${params.toString()}`);
  if (!resp.ok) {
    throw new Error(`בקשת SerpApi נכשלה (קוד ${resp.status})`);
  }
  const data: any = await resp.json();

  const organic = (data.organic_results || []).map((r: any) => {
    let domain = r.displayed_link || "";
    try {
      domain = new URL(r.link).hostname.replace(/^www\./, "");
    } catch { /* keep displayed_link fallback */ }
    return { position: r.position, title: r.title, link: r.link, domain, snippet: r.snippet || "" };
  });
  const relatedQuestions = (data.related_questions || []).map((q: any) => q.question).filter(Boolean);
  const relatedSearches = (data.related_searches || []).map((s: any) => s.query).filter(Boolean);

  return { organic, relatedQuestions, relatedSearches };
}

// 1. Competitor Analysis Router
app.post("/api/seo/analyze-competitors", async (req, res) => {
  try {
    const { targetUrl, topic, exclude } = req.body;
    if (!targetUrl && !topic) {
      return res.status(400).json({ error: "חובה לספק כתובת אתר או נושא לניתוח" });
    }
    const excludeNote = Array.isArray(exclude) && exclude.length
      ? `\n\nאל תחזיר מתחרים שכבר הוצגו (מצא חדשים בלבד): ${exclude.join(", ")}`
      : "";

    const client = getAIClient();

    // Ground the analysis in real Google IL ranking data when SerpApi is set.
    let serpGrounding = "";
    try {
      const serpQuery = topic || targetUrl;
      const serp = await fetchSerpResults(serpQuery);
      if (serp && serp.organic.length) {
        const top = serp.organic
          .slice(0, 10)
          .map((r: any) => `#${r.position} ${r.domain} — ${r.title}`)
          .join("\n");
        serpGrounding = `\n\nנתוני SERP אמיתיים מגוגל ישראל (SerpApi) עבור "${serpQuery}". בסס את הניתוח על המתחרים האמיתיים שמדורגים בפועל, לא על השערות:\nתוצאות אורגניות מובילות:\n${top}\n`;
        if (serp.relatedQuestions.length) {
          serpGrounding += `\nשאלות שאנשים שואלים (PAA): ${serp.relatedQuestions.join(" | ")}\n`;
        }
        if (serp.relatedSearches.length) {
          serpGrounding += `חיפושים קשורים: ${serp.relatedSearches.join(" | ")}\n`;
        }
      }
    } catch (serpErr) {
      console.warn("SERP grounding failed, continuing with Gemini-only analysis:", serpErr);
    }

    const prompt = `בצע ניתוח מתחרים מעמיק ומקצועי עבור אתר האינטרנט או הנושא הבאים:
כתובת האתר: ${targetUrl || "לא צוין אתר ספציפי"}
הנושא/הנישה: ${topic || "ניתוח כללי של האתר"}${serpGrounding}${excludeNote}

עליך לבצע מחקר אינטרנטי עדכני באמצעות כלי החיפוש של גוגל כדי למצוא את 3 המתחרים האורגניים הרלוונטיים של האתר או הנושא הזה בגוגל ישראל, ולאסוף נתונים מדויקים ככל הניתן של נתחי שוק, מילות מפתח מובילות, סמכות דומיין מוערכת (Domain Authority), פרופיל קישורים חיצוניים, בעיות On-page SEO נפוצות ואסטרטגיית התוכן שלהם.

הנחיה קריטית לרלוונטיות: האתר הזה הוא של מאמן/מטפל עצמאי בקנה מידה קטן, לא מוסד גדול. לכן תעדיף מתחרים **באותו קנה מידה** - מאמנים פרטיים, מטפלים עצמאיים, קליניקות בוטיק ובלוגים מקצועיים אישיים שמדרגים על ביטויי זנב-ארוך וניש. אל תחזיר מרכזים מוסדיים ענקיים (כמו מכונים ארציים גדולים) אלא אם אין באמת ברירה, וגם אז לכל היותר אחד מתוך השלושה. חפש מי שהקהל והשירות שלו דומים לשל מאמן יחיד, כי אלה המתחרים האמיתיים על אותו לקוח.

חובה להחזיר בדיוק 3 מתחרים, גם אם צריך להרחיב את החיפוש לביטויי ניש כדי למצוא מאמנים עצמאיים נוספים.

החזר את התוצאה אך ורק בפורמט JSON כסרסור (Array of Objects) המכיל בדיוק 3 ישויות התואמות למבנה הבא (אל תפרט הערות נוספות מחוץ ל-JSON):
[
  {
    "competitorName": "שם המתחרה הראשון (שם מותג או אתר מוכר)",
    "websiteUrl": "כתובת אתר המתחרה (למשל, domain.co.il)",
    "domainAuthority": 45, // מספר בין 1 ל-100 המייצג סמכות דומיין מוערכת בארץ
    "estimatedTraffic": "35K/month", // מספר כניסות מוערך בחודש
    "trafficShare": 30, // אחוז נתח שוק מתוך שלושתם (הסכום של השלושה צריך להיות 100)
    "mainKeywords": ["מילת מפתח 1", "מילת מפתח 2", "מילת מפתח 3", "מילת מפתח 4", "מילת מפתח 5"],
    "strengths": ["חוזק 1", "חוזק 2", "חוזק 3"],
    "weaknesses": ["חולשה 1", "חולשה 2", "חולשה 3"],
    "backlinkProfile": {
      "strength": "High" | "Medium" | "Low",
      "estimatedCount": 1520, // כמות קישורים חיצוניים מוערכת
      "anchorTextStrategy": "תיאור קצר של אסטרטגיית אנקור טקסט"
    },
    "onPageSEOStatus": {
      "score": 88, // ציון On-Page SEO בין 1 ל-100
      "mobileFriendly": true, // ידידותי לנייד
      "pageSpeed": "Fast" | "Average" | "Slow",
      "missingMetaTags": ["Meta tag 1 חסר", "כותרת H1 כפולה"] // רשימת תגים חסרים או בעיות
    },
    "contentStrategy": "סיכום אסטרטגיית התוכן והבלוג שלהם (2-3 משפטים בעברית)"
  }
]

יש לכתוב את כל השדות הטקסטואליים והתיאורים בעברית רהוטה ומקצועית של אסטרטג SEO בכיר. השתמש בחיפוש גוגל כדי להציע מתחרים אמיתיים ורלוונטיים בארץ!`;

    // When SerpApi already supplied real ranking data, we do NOT need Gemini's
    // Google Search grounding (which has a tiny, separate free-tier quota and is
    // the reason competitor analysis kept returning 429). Analyze the real data
    // with a clean JSON response instead. Grounding is kept only as a fallback
    // when no SerpApi data is available.
    const config: any = {
      systemInstruction: "You are an elite SEO strategist and organic growth specialist with absolute expertise in Google Israel's local search ecosystem and search algorithms.",
    };
    if (serpGrounding) {
      config.responseMimeType = "application/json";
    } else {
      config.tools = [{ googleSearch: {} }];
    }

    const response = await client.models.generateContent({
      // Lightweight model: far higher free-tier limits (RPD 500 vs 20) to avoid
      // exhausting quota on competitor analysis.
      model: process.env.COMPETITOR_MODEL || "gemini-3.1-flash-lite",
      contents: prompt,
      config,
    });

    const resultText = response.text || "[]";
    const data = parseJSONResponse(resultText);
    res.json({ competitors: data });
  } catch (error: any) {
    console.error("Error in analyze-competitors:", error);
    res.status(500).json({ error: error.message || "שגיאה בניתוח המתחרים" });
  }
});

// 2. Keyword Research Router
app.post("/api/seo/search-keywords", async (req, res) => {
  try {
    const { seedKeyword, topic, exclude } = req.body;
    if (!seedKeyword) {
      return res.status(400).json({ error: "חובה לספק מילת מפתח או נושא ראשי" });
    }
    const excludeNote = Array.isArray(exclude) && exclude.length
      ? `\n\nאל תחזיר מילות מפתח שכבר הוצגו (החזר חדשות ושונות בלבד): ${exclude.join(", ")}`
      : "";

    const client = getAIClient();

    // Real keyword ideas from Google IL via SerpApi (related searches + PAA).
    // SerpApi does the live search; Gemini only estimates the metrics, so we no
    // longer need Gemini's grounding (which caused the 429s).
    let serpKeywords = "";
    try {
      const serp = await fetchSerpResults(seedKeyword);
      if (serp) {
        const ideas = [...serp.relatedSearches, ...serp.relatedQuestions];
        if (ideas.length) {
          serpKeywords = `\n\nרעיונות מילות מפתח אמיתיים מגוגל ישראל (SerpApi) עבור "${seedKeyword}". בסס את הרשימה בעיקר על אלה:\n${ideas.map((k) => `- ${k}`).join("\n")}\n`;
        }
      }
    } catch (serpErr) {
      console.warn("SERP keyword grounding failed, continuing:", serpErr);
    }

    const prompt = `בצע מחקר מילות מפתח מקיף ועדכני עבור מילת המפתח הבאה או הנושא הבא:
מילת מפתח / נושא ראשי: ${seedKeyword}
נושא נלווה: ${topic || "ללא נושא נלווה"}${serpKeywords}${excludeNote}

עליך להציע את מילות המפתח המניבות, מילות הזנב הארוך (Long-tail) והביטויים הקשורים שהכי כדאי לקדם בגוגל ישראל (התבסס על הרעיונות האמיתיים לעיל אם סופקו), כולל חיזוי נפח חיפוש מוערך, רמת תחרות קושי (Difficulty), עלות לקליק מוערכת בדולרים (CPC), כוונת החיפוש הדומיננטית (Intent), מדד יעילות מילת המפתח (KEI - Keyword Effectiveness Index שבו נפח חיפוש חלקי רמת קושי בריבוע), ערך הקידום (SEO Value), רמת רלוונטיות לנושא והמלצה מעשית.

החזר בדיוק רשימה של 8-10 מילות מפתח בפורמט JSON של סרסור (Array of Objects):
[
  {
    "keyword": "מילת המפתח המוצעת לשדרוג",
    "searchVolume": 1200, // נפח חיפוש חודשי מוערך בגוגל ישראל
    "difficulty": 45, // רמת קושי מ-0 (קל מאוד) עד 100 (קשה מאוד)
    "cpc": 2.15, // עלות לקליק מוערכת ב-USD (מספר עשרוני)
    "intent": "Informational" | "Transactional" | "Navigational" | "Commercial",
    "kei": 23.4, // מדד KEI (נפח חיפוש / קושי)
    "seoValue": "High" | "Medium" | "Low",
    "relevanceToTopic": 9, // ציון רלוונטיות מ-1 עד 10 לקבוצה
    "suggestedAction": "הנחיה מעשית קצרה כיצד לקדם מילה זו (למשל: 'כתיבת מדריך מקיף וקישור מהעמוד הראשי')"
  }
]

יש לכתוב את מילות המפתח ברובן בעברית (מלבד ביטויים לועזיים רשמיים), ואת כל שאר השדות בעברית מקצועית וברורה עבור מקדם אתרים מקצועי בארץ.`;

    const kwConfig: any = {
      systemInstruction: "You are an elite local SEO planner and keyword strategist who turns real Israeli search data into actionable keyword opportunities with estimated metrics.",
    };
    // Skip grounding when SerpApi already provided real keyword ideas.
    if (serpKeywords) {
      kwConfig.responseMimeType = "application/json";
    } else {
      kwConfig.tools = [{ googleSearch: {} }];
    }

    const response = await client.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: prompt,
      config: kwConfig,
    });

    const resultText = response.text || "[]";
    const data = parseJSONResponse(resultText);
    res.json({ keywords: data });
  } catch (error: any) {
    console.error("Error in search-keywords:", error);
    res.status(500).json({ error: error.message || "שגיאה בחיפוש מילות מפתח" });
  }
});

// 3. SEO Article Generator Router
app.post("/api/seo/generate-article", async (req, res) => {
  try {
    const { keyword, audience, tone, additionalKeywords, guidelines, useSearch, selectedModel } = req.body;
    if (!keyword) {
      return res.status(400).json({ error: "חובה לספק מילת מפתח ראשית לייצור המאמר" });
    }

    const client = getAIClient();
    const modelName = selectedModel || "gemini-3.5-flash";

    let searchGuidance = "";
    if (useSearch) {
      searchGuidance = `\nהערה קריטית: מופעל כעת חיפוש רשת חי (Google Search Grounding). חובה עליך לבצע שאילתות בגוגל על הנושא '${keyword}' ועל הטרנדים ומילות המפתח האחרונות נכון לשנת 2026 כדי להפיק טקסט מדויק, רלוונטי, ומלא בעובדות ודוגמאות אמיתיות מהמציאות הנוכחית בארץ.`;
    }

    const prompt = `כתוב מאמר עומק לאתר "מצפן הלב" של יוסי מדלסי, סביב מילת המפתח הראשית הבאה:
מילת מפתח ראשית: ${keyword}
קהל יעד: ${audience || "הורים למתבגרים, נוער, וזוגות"}
סגנון כתיבה (Tone): ${tone || "סמכותי וחברי בו זמנית, אדם שעבר"}
מילות מפתח נוספות לשילוב: ${additionalKeywords || "ללא מילות מפתח נוספות"}
הנחיות מיוחדות מהלקוח: ${guidelines || "אין משהו מיוחד"}${searchGuidance}

חוקי הקול של מצפן הלב (מחייבים, אי-עמידה בהם פוסלת את המאמר):
1. כללי פסילה מוחלטים: אסור מקפים ארוכים (—) בשום צורה. אסור סימני פיסוק מוגזמים. אסור דימויים מנופחים. אסור פתיחות נוסחתיות ("רבים מאיתנו", "כולנו מכירים", "האם גם אתם").
2. קודם הסיפור, רק אחר כך השכבה הסמנטית. פותחים בכניסה דרך הצד, סצנה אחת חיה וספציפית, לא ישר לנושא ולא בתזה מופשטת.
3. עברית מדוברת, משפטים קצרים שעומדים בפני עצמם. פסקה היא משפט עד שלושה. RTL תמיד.
4. אוטוריטה (חוקר/מחקר) נכנסת כדי להוכיח נקודה, במשפט אחד מובלע בסיפור, ולא כרשימת מקורות ולא כפתרון.
5. הסיום הוא שאלת זהות פתוחה שנשארת עם הקורא, לעולם לא CTA קר ולא "צור קשר" ולא הבטחת תוצאה.
6. לפחות משפט הגדרה עצמאי אחד, חד, שמנוע AI יכול לחלץ כתשובה שלמה לשאלת החיפוש (זה שדה aiCitation).

מבנה ארבעת מרכיבי ה-SEO (הקפד על ההבחנה ביניהם):
- title: שאלת חיפוש נפוצה, מה שאדם באמת מקליד בגוגל או ב-ChatGPT. לא כותרת ספרותית.
- goldLine: תת-כותרת קצרה ומסקרנת שמתארת את המנגנון. משפט אחד חד ופרובוקטיבי, לקורא האנושי (לא ל-meta).
- excerpt: תקציר ענייני של שניים עד שלושה משפטים תיאוריים, פונה למנוע, יושב ב-meta description ובכרטיס באתר.
- urlSlug: מילות מפתח באנגלית מופרדות במקפים (למשל why-we-attract-unavailable-partners).

החזר את כל הנתונים במבנה JSON הבא בדיוק (אל תפרט הערות נוספות מחוץ ל-JSON):
{
  "id": "מזהה ייחודי קצר שאתה מייצר",
  "keyword": "${keyword}",
  "title": "כותרת בנוסח שאלת חיפוש (H1)",
  "goldLine": "תת-כותרת המנגנון, משפט אחד חד",
  "metaTitle": "כותרת SEO עד 60 תווים",
  "metaDescription": "תיאור מטא עד 155 תווים, זהה או נגזר מה-excerpt",
  "excerpt": "תקציר ענייני של 2-3 משפטים להדבקה בשדה excerpt ב-Sanity",
  "urlSlug": "english-keywords-with-hyphens",
  "authorLine": "שורת סמכות קצרה על הכותב (שדה authorLine ב-Sanity)",
  "imageAlt": "תיאור alt קצר ומדויק לתמונה הראשית, כולל מילת המפתח באופן טבעי",
  "tags": ["בחר ערך אחד או שניים אך ורק מתוך הרשימה הסגורה: זוגיות, הורות, נוער, קריירה, התפתחות אישית"],
  "aiCitation": "משפט הגדרה עצמאי אחד וחד שעונה על שאלת החיפוש במלואה ללא הקשר נוסף",
  "wordCount": 850,
  "outline": [
    { "sectionTitle": "כותרת ביניים שהיא מנגנון ולא קישוט", "description": "תמצית קצרה" }
  ],
  "content": "גוף המאמר המלא בפורמט Markdown (כותרות ##, פסקאות, הדגשות). זה לתצוגה ולעריכה.",
  "bodyHtml": "אותו גוף מאמר בדיוק כ-HTML עם dir=\\"rtl\\" בכל בלוק (<p dir=\\"rtl\\">, <h2 dir=\\"rtl\\">, <blockquote dir=\\"rtl\\">). בלי תגיות <html>/<head>/<body>, רק תוכן הגוף, מוכן להדבקה לעורך Portable Text של Sanity. בלי מקפים ארוכים.",
  "faqs": [
    { "question": "שאלה נפוצה אמיתית?", "answer": "תשובה קצרה ומדויקת" }
  ],
  "seoTips": ["טיפ לקידום הדף", "טיפ לקישור פנימי (לבדוק שהוא קיים באתר לפני שימוש)"]
}

חובה: tags אך ורק מהרשימה הסגורה (זוגיות / הורות / נוער / קריירה / התפתחות אישית). content ו-bodyHtml חייבים להיות אותו מאמר בדיוק, רק בפורמט שונה. כתוב בעברית רהוטה ונקייה בקול של יוסי.`;

    const config: any = {
      systemInstruction: "You are Yossi Medalsi's content architect for the Hebrew brand 'מצפן הלב' (HeartCompass). You write emotionally precise Hebrew articles in his voice: story first, semantic SEO layer second. You strictly avoid em-dashes, formulaic openings, and cold CTAs. Every article maps cleanly onto the Sanity 'article' schema fields.",
      responseMimeType: "application/json"
    };

    if (useSearch) {
      config.tools = [{ googleSearch: {} }];
    }

    const response = await client.models.generateContent({
      model: modelName,
      contents: prompt,
      config: config
    });

    const resultText = response.text || "{}";
    const data = parseJSONResponse(resultText);
    res.json({ article: data });
  } catch (error: any) {
    console.error("Error in generate-article:", error);
    res.status(500).json({ error: error.message || "שגיאה בייצור המאמר" });
  }
});

// 5. SEO Article AI Editor Router supporting multiple models & optional live search grounding
app.post("/api/seo/edit-article", async (req, res) => {
  try {
    const { article, editPrompt, selectedModel, useSearch } = req.body;
    if (!article || !editPrompt) {
      return res.status(400).json({ error: "חובה לספק מאמר קיים והנחיות עריכה" });
    }

    const client = getAIClient();
    const modelName = selectedModel || "gemini-3.5-flash";

    let searchGuidance = "";
    if (useSearch) {
      searchGuidance = `\nהערה קריטית: מופעל כעת חיפוש רשת חי (Google Search Grounding). חובה עליך להשתמש בכלי החיפוש גוגל כדי למצוא עובדות רלוונטיות, טרנדים או מידע חדש לשילוב במאמר לפי הנחיית המשתמש.`;
    }

    const prompt = `אתה עורך תוכן ועיתונאי SEO בכיר מחברת דירוג מובילה. המשימה שלך היא לערוך ולשפר מאמר קיים בהתאם להנחיות המשתמש.

הפרטים של המאמר המקורי:
- כותרת המאמר: ${article.title}
- מילת מפתח ראשית: ${article.keyword}
- כותרת מטא: ${article.metaTitle || ""}
- תיאור מטא: ${article.metaDescription || ""}
- סלאג: ${article.urlSlug || ""}
- קידומי SEO אחרים: ${article.seoTips ? article.seoTips.join(", ") : ""}

התוכן הנוכחי של המאמר בפורמט Markdown:
${article.content}

הנחיות העריכה והשיפור המבוקשות של המשתמש:
"${editPrompt}"${searchGuidance}

עליך לבצע את העריכה המבוקשת בצורה מדויקת, עקבית ומקצועית במיוחד, תוך שמירה על הנהלים הבאים:
1. בצע את השינוי בתוכן המאמר, אך עדכן גם את תגיות המטא (metaTitle, metaDescription), הסלאג (urlSlug) והכותרת (title) אם הדבר מתבקש או ראוי לאלגוריתם הקידום.
2. שמור על פורמט Markdown מלא, תקין ואסתטי.
3. שמור על חוקי הקול של מצפן הלב: בלי מקפים ארוכים, בלי פתיחות נוסחתיות, בלי CTA קר. שמור על כל השדות של סכימת Sanity ועדכן אותם אם השינוי מצריך.
4. החזר אך ורק מבנה JSON תואם לחלוטין (אל תפרט הערות נוספות מחוץ ל-JSON):
{
  "id": "${article.id || "art_" + Date.now()}",
  "keyword": "${article.keyword}",
  "title": "הכותרת המעודכנת (או המקורית)",
  "goldLine": "תת-כותרת המנגנון המעודכנת (או המקורית)",
  "metaTitle": "SEO Title מעודכן",
  "metaDescription": "Meta Description מעודכן",
  "excerpt": "תקציר ענייני מעודכן (2-3 משפטים)",
  "urlSlug": "excellent-slug-example",
  "authorLine": "שורת סמכות (או המקורית)",
  "imageAlt": "תיאור alt לתמונה הראשית",
  "tags": ["מתוך הרשימה הסגורה בלבד: זוגיות, הורות, נוער, קריירה, התפתחות אישית"],
  "aiCitation": "משפט הגדרה עצמאי שמנוע AI יכול לחלץ",
  "wordCount": 850,
  "outline": [
    { "sectionTitle": "שם הפרק", "description": "תמצית קצרה" }
  ],
  "content": "התוכן המלא המעודכן בפורמט Markdown...",
  "bodyHtml": "אותו תוכן מעודכן כ-HTML עם dir=\\"rtl\\" בכל בלוק, מוכן להדבקה ל-Sanity",
  "faqs": [
    { "question": "שאלה נפוצה", "answer": "תשובה קצרה" }
  ],
  "seoTips": ["טיפ אופטימיזציה ראשון", "טיפ שני"]
}`;

    const config: any = {
      systemInstruction: "You are an elite SEO chief editor. Your goal is to rewrite, refine, expand, or correct text to perfection while ensuring the highest alignment with search algorithms.",
      responseMimeType: "application/json"
    };

    if (useSearch) {
      config.tools = [{ googleSearch: {} }];
    }

    const response = await client.models.generateContent({
      model: modelName,
      contents: prompt,
      config: config
    });

    const resultText = response.text || "{}";
    const data = parseJSONResponse(resultText);
    res.json({ article: data });
  } catch (error: any) {
    console.error("Error in edit-article:", error);
    res.status(500).json({ error: error.message || "שגיאה בעריכת המאמר בעזרת AI" });
  }
});

// 6. Content SEO Audit & Semantic Quality Analyzer Router
app.post("/api/seo/analyze-content", async (req, res) => {
  try {
    const { content, keyword } = req.body;
    if (!content) {
      return res.status(400).json({ error: "חובה לספק תוכן לביצוע הניתוח" });
    }

    const client = getAIClient();
    const prompt = `בצע ניתוח SEO מקיף וכירורגי לתוכן הבא. 
מילת מפתח מיועדת למיקוד: ${keyword || "לא הוגדרה מילת מפתח ספציפית"}

התוכן לראייה:
${content}

על הניתוח לכלול:
1. ציון אופטימיזציה כולל (Score) מ-1 עד 100 על בסיס רמת העומק, שזירת מילות מפתח ומבנה.
2. ניתוח צפיפות מילות מפתח קצר (Keyword Density Analysis).
3. הערכת קריאות וזרימה (Readability).
4. רשימה של חוזקות נוכחיות של הטקסט (Strengths - לפחות 2 פריטים).
5. רשימה מפורטת של הצעות שיפור ומשימות לביצוע (Actionable Recommendations - לפחות 3 פריטים).
6. טבלת בדיקת גורמי מפתח (Checklist) הכוללת גורם (factor) והאם עבר את הבדיקה (passed - true/false).

החזר אך ורק בפורמט JSON הבא בדיוק (ללא שום טקסט עודף מחוץ ל-JSON):
{
  "score": 75,
  "readability": "רמת קריאות מעולה, שפה קולחת המתאימה ביותר לקהל היעד...",
  "densityInfo": "מילת המפתח נמצאת בצפיפות תקינה בגוף הטקסט.",
  "strengths": [
    "חוזק ראשון שנמצא",
    "חוזק שני שנמצא"
  ],
  "recommendations": [
    "המלצה ראשונה מפורטת",
    "המלצה שנייה מפורטת",
    "המלצה שלישית מפורטת"
  ],
  "checklist": [
    { "factor": "כותרת H1 ייחודית", "passed": true },
    { "factor": "שילוב מילת מפתח בפסקה הראשונה", "passed": true },
    { "factor": "צפיפות מילות מפתח אורגנית", "passed": true },
    { "factor": "שימוש ברשימות ומשפטים קצרים", "passed": false }
  ]
}`;

    const response = await client.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: prompt,
      config: {
        systemInstruction: "You are a professional SEO content auditor with deep knowledge of search intent, NLP patterns, and semantic search.",
        responseMimeType: "application/json"
      }
    });

    const resultText = response.text || "{}";
    const data = parseJSONResponse(resultText);
    res.json({ audit: data });
  } catch (error: any) {
    console.error("Error in analyze-content:", error);
    res.status(500).json({ error: error.message || "שגיאה באנליזת ה-SEO" });
  }
});

// 4. SEO Expert Chat Router with Google Search Grounding for live algorithms check!
app.post("/api/seo/chat-expert", async (req, res) => {
  try {
    const { chatHistory, message, useSearch } = req.body;
    if (!message) {
      return res.status(400).json({ error: "חובה לספק הודעה" });
    }

    const client = getAIClient();

    // Reconstruct history
    const geminiContents: any[] = [];
    if (chatHistory && Array.isArray(chatHistory)) {
      chatHistory.forEach((msg: any) => {
        geminiContents.push({
          role: msg.role === "user" ? "user" : "model",
          parts: [{ text: msg.message || msg.text || "" }]
        });
      });
    }

    // Append latest prompt
    geminiContents.push({
      role: "user",
      parts: [{ text: message }]
    });

    const chatConfig: any = {
      systemInstruction: `אתה אסטרטג קידום אתרים (SEO) בכיר ביותר, יועץ אלגוריתמים של גוגל ומומחה בינה מלאכותית מוערך.
תפקידך לענות לשאלת המשתמש בעברית ובצורה מקצועית, מפורטת ומגובה בדוגמאות מעשיות.
התשובות שלך צריכות להיות באופי של יועץ פרטי לחברה שמשלמת אלפי דולרים על ייעוץ. הייה ישיר, אנליטי, וספק משימות/שלבים ברורים לביצוע (checklist) בכל תשובה.`,
    };
    // Live Google Search grounding only when the user explicitly enables it
    // (it consumes the small separate grounding quota). Otherwise answer from
    // the model's own knowledge -- cheaper and avoids 429s.
    if (useSearch) {
      chatConfig.tools = [{ googleSearch: {} }];
    }

    const response = await client.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: geminiContents,
      config: chatConfig,
    });

    res.json({ text: response.text });
  } catch (error: any) {
    console.error("Error in chat-expert:", error);
    res.status(500).json({ error: error.message || "שגיאה בצ'אט המומחה" });
  }
});

// Integration status — lets the UI show which manual connections are wired,
// so the user controls exactly what is connected. Based purely on whether the
// relevant env keys are present; no external calls are made here.
app.get("/api/seo/status", (_req, res) => {
  res.json({
    gemini: Boolean(process.env.GEMINI_API_KEY),
    serpapi: Boolean(process.env.SERPAPI_KEY),
    searchConsole: Boolean(process.env.VITE_GSC_SITE_URL),
  });
});

// 7. Live SERP lookup (SerpApi) — raw Google Israel results for a query
app.post("/api/seo/serp", async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) {
      return res.status(400).json({ error: "חובה לספק שאילתת חיפוש" });
    }
    if (!process.env.SERPAPI_KEY) {
      return res.status(400).json({ error: "מפתח SerpApi (SERPAPI_KEY) חסר בהגדרות השרת. הוסף אותו ל-.env.local ול-Vercel." });
    }
    const serp = await fetchSerpResults(query);
    res.json({ serp });
  } catch (error: any) {
    console.error("Error in serp:", error);
    res.status(500).json({ error: error.message || "שגיאה בשליפת תוצאות SERP" });
  }
});

// 8. Internal link suggestions from the Sanity CMS. Uses the public dataset
// read API (no token), so it surfaces only REAL existing articles/slugs — which
// is exactly the brand rule: never invent internal links.
app.post("/api/seo/internal-links", async (req, res) => {
  try {
    const { keyword, tags } = req.body;
    const projectId = process.env.VITE_SANITY_PROJECT_ID || "bk4y5jiw";
    const dataset = process.env.VITE_SANITY_DATASET || "production";
    const groq = '*[_type=="article" && defined(slug.current)]{title,"slug":slug.current,tags,excerpt}';
    const url = `https://${projectId}.api.sanity.io/v2021-10-21/data/query/${dataset}?query=${encodeURIComponent(groq)}`;

    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`שאילתת Sanity נכשלה (קוד ${resp.status})`);
    }
    const data: any = await resp.json();
    const articles: any[] = data.result || [];

    const kwTokens = String(keyword || "").split(/\s+/).filter((t) => t.length > 1);
    const tagSet = new Set<string>(Array.isArray(tags) ? tags : []);

    const scored = articles
      .map((a) => {
        let score = 0;
        (a.tags || []).forEach((t: string) => { if (tagSet.has(t)) score += 2; });
        kwTokens.forEach((tok) => {
          if ((a.title || "").includes(tok) || (a.excerpt || "").includes(tok)) score += 1;
        });
        return { title: a.title, slug: a.slug, tags: a.tags || [], score };
      })
      .filter((a) => a.score > 0)
      .sort((x, y) => y.score - x.score)
      .slice(0, 6);

    res.json({ links: scored, totalArticles: articles.length });
  } catch (error: any) {
    console.error("Error in internal-links:", error);
    res.status(500).json({ error: error.message || "שגיאה בשליפת קישורים פנימיים" });
  }
});

// =======================
// SOCIAL SUITE ROUTES
// =======================

// S1. List published articles from Sanity (public dataset) to feed the
// post-generator picker. Same source the SEO internal-links route uses.
app.get("/api/social/articles", async (_req, res) => {
  try {
    const projectId = process.env.VITE_SANITY_PROJECT_ID || "bk4y5jiw";
    const dataset = process.env.VITE_SANITY_DATASET || "production";
    const groq =
      '*[_type=="article" && defined(slug.current)]|order(coalesce(publishedAt,_createdAt) desc){title,"slug":slug.current,excerpt,tags}';
    const url = `https://${projectId}.api.sanity.io/v2021-10-21/data/query/${dataset}?query=${encodeURIComponent(groq)}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`שאילתת Sanity נכשלה (קוד ${resp.status})`);
    const data: any = await resp.json();
    res.json({ articles: data.result || [] });
  } catch (error: any) {
    console.error("Error in social/articles:", error);
    res.status(500).json({ error: error.message || "שגיאה בשליפת המאמרים" });
  }
});

// S2. Generate FB/IG posts from a Sanity article (by slug) or a free topic.
app.post("/api/social/generate-posts", async (req, res) => {
  try {
    const { slug, topic, customText, platforms, goal, model } = req.body;
    const wanted: string[] =
      Array.isArray(platforms) && platforms.length ? platforms : ["instagram", "facebook"];

    const client = getAIClient();

    // Pull the source material: a real article (via Sanity pt::text) or free text.
    let sourceTitle = topic || "";
    let sourceUrl = "";
    let sourceBody = customText || "";

    if (slug) {
      const projectId = process.env.VITE_SANITY_PROJECT_ID || "bk4y5jiw";
      const dataset = process.env.VITE_SANITY_DATASET || "production";
      const groq = `*[_type=="article" && slug.current==$slug][0]{title,excerpt,"text":pt::text(body)}`;
      const url = `https://${projectId}.api.sanity.io/v2021-10-21/data/query/${dataset}?query=${encodeURIComponent(
        groq
      )}&$slug=${encodeURIComponent(JSON.stringify(slug))}`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`שאילתת Sanity נכשלה (קוד ${resp.status})`);
      const data: any = await resp.json();
      const art = data.result;
      if (!art) return res.status(404).json({ error: "המאמר לא נמצא ב-Sanity" });
      sourceTitle = art.title || sourceTitle;
      sourceBody = art.text || art.excerpt || sourceBody;
      sourceUrl = `https://heartcompass.vercel.app/articles/${slug}`;
    }

    if (!sourceTitle && !sourceBody) {
      return res.status(400).json({ error: "חובה לבחור מאמר או להזין נושא/טקסט מקור" });
    }

    const labelMap: Record<string, string> = {
      instagram: "אינסטגרם",
      facebook: "פייסבוק",
      reels: "רילס (וידאו קצר)",
    };
    const platformLabel = wanted.map((p) => labelMap[p] || p).join(" ו");
    const wantsReels = wanted.includes("reels");
    const captionPlatforms = wanted.filter((p) => p !== "reels");

    const prompt = `אתה אסטרטג תוכן לרשתות חברתיות של המותג "מצפן הלב" של יוסי מדלסי (אימון רגשי תודעתי לנוער, הורים וזוגות).
המשימה: להפוך את חומר המקור הבא לפוסטים מנצחים ל${platformLabel}.

כותרת/נושא המקור: ${sourceTitle || "ללא כותרת"}
${sourceUrl ? `קישור למאמר המלא: ${sourceUrl}` : ""}
מטרת הפוסט: ${goal || "מודעות ומעורבות (engagement), והנעה עדינה לקריאת המאמר/פנייה"}

חומר המקור:
${(sourceBody || "").slice(0, 6000)}

חוקי הקול של מצפן הלב — מחייבים, אי-עמידה פוסלת את הפוסט:

כללי פסילה מוחלטים:
- אסור מקפים ארוכים (—) בשום צורה.
- אסור פתיחות נוסחתיות ("רבים מאיתנו", "כולנו מכירים", "האם גם אתם").
- אסור רשימות בפוסט.
- אסור CTA קר ("צור קשר", "הזמן פגישה", "אני כאן בשבילך").
- אסור הבטחת תוצאה ("תשתחרר", "תפסיק לריב"). מבטיחים הבנה, לא תוצאה.
- אסור "השיטה שלנו" / "הכלים שלנו". יוסי מדבר מהחיים, לא מהמוצר.
- אסור לתייג או לתת שם לאבחנה ("אתה פרפקציוניסט"). מראים את התופעה, לא קוראים לה בשם.

הקול:
- סמכותי וחברי בו זמנית. אדם שעבר, לא מומחה מתנשא ולא חבר מתרפס. אגרוף בבטן בעדינות.
- קודם סיפור, רק אחר כך הנקודה. נכנסים דרך הצד, סצנה אחת חיה וספציפית, לא תזה מופשטת.
- ספציפיות כהוכחת נוכחות: "הוא צחק חצי שנייה אחרי כולם" ולא "הוא הרגיש לא שייך".
- מדברים על "הוא/היא" (סיפור על מישהו אחר), לא "אתה". זיהוי עצמי דרך אדם אחר חזק יותר.
- בפוסט: שאלה היא חריג, התמונה היא ברירת המחדל. שאלה מותרת רק כתהייה בקול רם של יוסי, לא כפנייה ישירה לקורא.
- אם מביאים מחקר: חוקר עם שם וממצא אחד ברור, מובלע במשפט אחד בתוך הסיפור. לא "מחקרים מראים".

סדר הרגשות (מאיה אנג'לו): קודם "מישהו מבין אותי", אחר כך אגרוף בבטן של אמת, ואז דחיפות שקטה.
הסיום: לולאה פתוחה. תמונה או תהייה שנשארת בגוף, לא מסקנה מסכמת ולא פתרון. אם הקורא יכול לסגור ולהרגיש שקיבל הכל, נכשלת.

התאמות פלטפורמה:
- אינסטגרם: ויזואלי ואישי, כיתוב קצר-בינוני, מעברי שורה נושמים, האשטגים בסוף בלבד.
- פייסבוק: סיפורי ומעט ארוך יותר, כמעט בלי האשטגים.

החזר אך ורק JSON במבנה הבא (בלי טקסט מחוץ ל-JSON):
{
  "sourceTitle": "${sourceTitle || ""}",
  "sourceUrl": "${sourceUrl}",
  "posts": [
    {
      "platform": "instagram",
      "hookVariations": ["וריאציית פתיח 1", "וריאציית פתיח 2", "וריאציית פתיח 3"],
      "caption": "הכיתוב המלא בקול של מצפן הלב, עם מעברי שורה טבעיים",
      "hashtags": ["#האשטג1", "#האשטג2", "#האשטג3"],
      "cta": "הנעה רכה לפעולה (לא קרה)",
      "visualIdea": "רעיון ויזואלי קונקרטי לפוסט (תמונה/קרוסלה/וידאו)"
    }
  ],
  "carousel": [
    { "slideTitle": "כותרת שקופית", "slideText": "טקסט קצר לשקופית" }
  ],
  "reels": {
    "hook": "3 השניות הראשונות, משפט או תמונה שעוצרים גלילה",
    "beats": [
      { "timecode": "0-3s", "onScreenText": "טקסט על המסך", "voiceover": "מה אומרים בקול", "visual": "מה רואים בפריים" }
    ],
    "caption": "כיתוב נלווה לרילס בקול של יוסי",
    "hashtags": ["#האשטג"],
    "audioIdea": "רעיון אודיו או סאונד מתאים",
    "cta": "הנעה רכה (לא קרה)"
  }
}

חובה: צור אובייקט post נפרד לכל פלטפורמת כיתוב מבוקשת (${captionPlatforms.join(", ") || "אין"}). ${wantsReels ? "בנוסף, מלא את האובייקט reels עם סקריפט וידאו מלא (5-7 ביטים עם timecode, טקסט על המסך, voiceover וויזואל)." : "החזר reels כ-null."} אם אינסטגרם מבוקש, מלא carousel עם 4-6 שקופיות; אחרת החזר carousel כמערך ריק. כל הטקסט בעברית רהוטה בקול של יוסי.`;

    const response = await generateWithFallback(client, {
      model: model || process.env.SOCIAL_MODEL || "gemini-3.5-flash",
      contents: prompt,
      config: {
        systemInstruction:
          "אתה אסטרטג התוכן לרשתות של יוסי מדלסי, מותג 'מצפן הלב'. אתה הופך מאמרים לפוסטים בקול המדויק שלו: סיפור קודם, בלי מקפים ארוכים, בלי פתיחות נוסחתיות, בלי CTA קר, בלי הבטחות תוצאה. מדברים על 'הוא/היא' ולא 'אתה', ומסיימים בלולאה פתוחה.",
        responseMimeType: "application/json",
      },
    });

    const resultText = response.text || "{}";
    const data = parseJSONResponse(resultText);
    res.json({ result: data });
  } catch (error: any) {
    console.error("Error in social/generate-posts:", error);
    res.status(500).json({ error: friendlyError(error) });
  }
});

// S3. Hashtag & topic research (Gemini estimates; optional SerpApi grounding).
app.post("/api/social/research-hashtags", async (req, res) => {
  try {
    const { topic, platform, model, exclude } = req.body;
    if (!topic) return res.status(400).json({ error: "חובה לספק נושא למחקר" });
    const excludeNote = Array.isArray(exclude) && exclude.length
      ? `\n\nאל תחזיר האשטגים שכבר הוצגו (החזר חדשים בלבד): ${exclude.join(", ")}`
      : "";

    const client = getAIClient();
    const platformHe = platform === "facebook" ? "פייסבוק" : "אינסטגרם";

    // Optional real grounding from Google IL related searches/PAA.
    let grounding = "";
    try {
      const serp = await fetchSerpResults(topic);
      if (serp) {
        const ideas = [...serp.relatedSearches, ...serp.relatedQuestions];
        if (ideas.length) grounding = `\nרעיונות אמיתיים מגוגל ישראל (בסס עליהם):\n${ideas.map((k) => `- ${k}`).join("\n")}\n`;
      }
    } catch { /* ignore */ }

    const prompt = `אתה אסטרטג תוכן ל${platformHe} בעברית, מומחה למותג "מצפן הלב" (אימון רגשי לנוער, הורים וזוגות).
בצע מחקר נושא והאשטגים עבור: "${topic}".${grounding}${excludeNote}

החזר אך ורק JSON במבנה:
{
  "topic": "${topic}",
  "platform": "${platform === "facebook" ? "facebook" : "instagram"}",
  "hashtags": [
    { "tag": "#האשטג", "size": "broad" | "niche" | "branded", "estReach": "הערכת היקף (למשל 'מאות אלפי פוסטים')" }
  ],
  "angles": [ { "angle": "זווית תוכן", "hook": "משפט פתיחה מסקרן" } ],
  "bestTimes": ["חלון פרסום מומלץ עם נימוק קצר"],
  "contentPillars": ["עמוד תוכן מרכזי 1", "עמוד תוכן 2"]
}

הנחיות: 12-18 האשטגים בעברית (תמהיל broad/niche/branded), 4-6 זוויות תוכן, 3 חלונות פרסום, 4-5 עמודי תוכן. הכל בעברית, בקול של מצפן הלב (בלי מקפים ארוכים, בלי קלישאות).`;

    const response = await generateWithFallback(client, {
      model: model || process.env.SOCIAL_MODEL || "gemini-3.1-flash-lite",
      contents: prompt,
      config: {
        systemInstruction: "You are an expert Hebrew social media researcher for the 'מצפן הלב' brand. You output practical, realistic hashtag and content research with estimated reach.",
        responseMimeType: "application/json",
      },
    });

    const data = parseJSONResponse(response.text || "{}");
    res.json({ result: data });
  } catch (error: any) {
    console.error("Error in social/research-hashtags:", error);
    res.status(500).json({ error: friendlyError(error) });
  }
});

// S4. Competitor social analysis (Gemini + Google Search grounding; estimated).
app.post("/api/social/competitor-social", async (req, res) => {
  try {
    const { topic, handle, model, exclude } = req.body;
    if (!topic) return res.status(400).json({ error: "חובה לספק נושא או נישה" });
    const excludeNote = Array.isArray(exclude) && exclude.length
      ? `\n\nאל תחזיר מתחרים שכבר הוצגו (מצא חדשים בלבד): ${exclude.join(", ")}`
      : "";

    const client = getAIClient();

    // Ground in real Google IL signals when SerpApi is configured. We avoid the
    // googleSearch grounding tool here because its tiny separate quota caused 429s.
    let grounding = "";
    try {
      const serp = await fetchSerpResults(topic);
      if (serp && serp.organic.length) {
        grounding = `\nתוצאות אמיתיות מגוגל ישראל עבור "${topic}" (בסס עליהן):\n${serp.organic
          .slice(0, 8)
          .map((r: any) => `- ${r.domain} — ${r.title}`)
          .join("\n")}\n`;
      }
    } catch { /* ignore */ }

    const prompt = `בצע ניתוח מתחרים ברשתות חברתיות (אינסטגרם/פייסבוק) בעברית עבור הנישה: "${topic}".${grounding}${excludeNote}
${handle ? `החשבון שלנו: ${handle}.` : ""}
המותג שלנו: "מצפן הלב" של יוסי מדלסי, מאמן רגשי לנוער/הורים/זוגות, בקנה מידה של נותן שירות עצמאי.

מצא 3 מתחרים אמיתיים ורלוונטיים **באותו קנה מידה** (מאמנים/מטפלים/יוצרי תוכן עצמאיים בעברית), לא מותגי ענק. לכל מתחרה אמוד נתונים על בסיס חיפוש עדכני.

הערה: הנתונים מוערכים (אין API ציבורי לאנליטיקות אורגניות של אחרים). סמן הערכות כשצריך.

החזר אך ורק JSON של מערך בדיוק 3 ישויות:
[
  {
    "name": "שם המתחרה",
    "handle": "@handle או שם עמוד",
    "platform": "אינסטגרם" | "פייסבוק" | "טיקטוק",
    "estFollowers": "הערכת עוקבים (למשל '12K')",
    "contentStyle": "סגנון התוכן שלו (משפט)",
    "postingFrequency": "תדירות פרסום מוערכת",
    "strengths": ["חוזק 1", "חוזק 2", "חוזק 3"],
    "gaps": ["פער/הזדמנות עבורנו 1", "הזדמנות 2"],
    "winningFormats": ["פורמט מנצח 1", "פורמט 2"]
  }
]
כל הטקסט בעברית מקצועית.`;

    const response = await generateWithFallback(client, {
      model: model || process.env.COMPETITOR_MODEL || "gemini-3.1-flash-lite",
      contents: prompt,
      config: {
        systemInstruction: "You are a Hebrew social media competitive analyst. You find realistic, same-scale competitors and estimate their social strategy from public signals.",
        responseMimeType: "application/json",
      },
    });

    const data = parseJSONResponse(response.text || "[]");
    res.json({ competitors: data });
  } catch (error: any) {
    console.error("Error in social/competitor-social:", error);
    res.status(500).json({ error: friendlyError(error) });
  }
});

// S5. Social strategy chat (Gemini; optional live search).
app.post("/api/social/chat", async (req, res) => {
  try {
    const { chatHistory, message, useSearch, model } = req.body;
    if (!message) return res.status(400).json({ error: "חובה לספק הודעה" });

    const client = getAIClient();
    const contents: any[] = [];
    if (Array.isArray(chatHistory)) {
      chatHistory.forEach((m: any) => contents.push({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.message || "" }] }));
    }
    contents.push({ role: "user", parts: [{ text: message }] });

    const config: any = {
      systemInstruction: `אתה אסטרטג מדיה חברתית בכיר למותג "מצפן הלב" של יוסי מדלסי (אימון רגשי לנוער, הורים וזוגות).
ענה בעברית, מקצועי וישיר, עם שלבי ביצוע ברורים (checklist) בכל תשובה. שמור על קול המותג: אנושי, בלי קלישאות, בלי מקפים ארוכים, בלי הבטחות תוצאה.`,
    };
    if (useSearch) config.tools = [{ googleSearch: {} }];

    const response = await generateWithFallback(client, {
      model: model || process.env.SOCIAL_MODEL || "gemini-3.1-flash-lite",
      contents,
      config,
    });

    res.json({ text: response.text });
  } catch (error: any) {
    console.error("Error in social/chat:", error);
    res.status(500).json({ error: friendlyError(error) });
  }
});

// Local standalone server (NOT Vercel, NOT the Vite dev server). Serves the
// pre-built client from dist/ and listens. This is what `npm start` runs on a
// traditional Node host.
//
// - On Vercel: process.env.VERCEL is set, so this block is skipped; the Express
//   `app` is exported below and invoked per-request as a serverless function.
// - Under `npm run dev`: dev-server.ts sets DEV_SERVER before importing this
//   module and attaches the Vite middleware itself, so we must NOT also listen
//   here (that would double-bind the port).
if (!process.env.VERCEL && !process.env.DEV_SERVER) {
  const distPath = path.join(process.cwd(), "dist");
  app.use(express.static(distPath));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

export default app;
