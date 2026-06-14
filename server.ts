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
    const { targetUrl, topic } = req.body;
    if (!targetUrl && !topic) {
      return res.status(400).json({ error: "חובה לספק כתובת אתר או נושא לניתוח" });
    }

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
הנושא/הנישה: ${topic || "ניתוח כללי של האתר"}${serpGrounding}

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

    const response = await client.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        systemInstruction: "You are an elite SEO strategist and organic growth specialist with absolute expertise in Google Israel's local search ecosystem and search algorithms.",
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json"
      }
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
    const { seedKeyword, topic } = req.body;
    if (!seedKeyword) {
      return res.status(400).json({ error: "חובה לספק מילת מפתח או נושא ראשי" });
    }

    const client = getAIClient();

    const prompt = `בצע מחקר מילות מפתח מקיף ועדכני עבור מילת המפתח הבאה או הנושא הבא:
מילת מפתח / נושא ראשי: ${seedKeyword}
נושא נלווה: ${topic || "ללא נושא נלווה"}

עליך להשתמש בחיפוש גוגל כדי למצוא את מילות המפתח המניבות, מילות הזנב הארוך (Long-tail) והביטויים הקשורים שהכי כדאי לקדם בגוגל ישראל, כולל חיזוי נפח חיפוש מוערך, רמת תחרות קושי (Difficulty), עלות לקליק מוערכת בדולרים (CPC), כוונת החיפוש הדומיננטית (Intent), מדד יעילות מילת המפתח (KEI - Keyword Effectiveness Index שבו נפח חיפוש חלקי רמת קושי בריבוע), ערך הקידום (SEO Value), רמת רלוונטיות לנושא והמלצה מעשית.

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

    const response = await client.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        systemInstruction: "You are an elite local SEO planner and keyword strategist. You search the live web using Google Search tool to extract true, actionable Israeli market keyword opportunities and search terms.",
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json"
      }
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
      model: "gemini-3.5-flash",
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
    const { chatHistory, message } = req.body;
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

    const response = await client.models.generateContent({
      model: "gemini-3.5-flash",
      contents: geminiContents,
      config: {
        systemInstruction: `אתה אסטרטג קידום אתרים (SEO) בכיר ביותר, יועץ אלגוריתמים של גוגל ומומחה בינה מלאכותית מוערך. 
תפקידך לענות לשאלת המשתמש בעברית ובצורה מקצועית, מפורטת ומגובה בדוגמאות מעשיות. 
חובה עליך להשתמש בכלי החיפוש של גוגל (Google Search) בכל פעם שהמשתמש שואל לגבי חברות אמיתיות, מתחרים, עדכוני אלגוריתמים אחרונים של גוגל (כמו עדכוני Core Updates מ-2024, 2025 ו-2026), מגמות נוכחיות של SEO, או שינויים טכניים.
התשובות שלך צריכות להיות באופי של יועץ פרטי לחברה שמשלמת אלפי דולרים על ייעוץ. הייה ישיר, אנליטי, וספק משימות/שלבים ברורים לביצוע (checklist) בכל תשובה.`,
        tools: [{ googleSearch: {} }]
      }
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
