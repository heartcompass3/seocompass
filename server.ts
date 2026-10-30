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

// Ensure any deprecated model names are automatically mapped to active Gemini 3.8 models
function sanitizeModel(model?: string): string {
  if (!model) return "gemini-3.8-flash";
  const m = model.toLowerCase();
  if (m.includes("2.5") || m.includes("2.0") || m.includes("1.5")) {
    if (m.includes("pro")) return "gemini-3.8-pro";
    return "gemini-3.8-flash";
  }
  return model;
}

// Get Sanity Auth Token from env or local config
function getSanityToken(): string | null {
  if (process.env.SANITY_AUTH_TOKEN) return process.env.SANITY_AUTH_TOKEN;
  try {
    const os = require("os");
    const fs = require("fs");
    const cfgPath = path.join(os.homedir(), ".config", "sanity", "config.json");
    if (fs.existsSync(cfgPath)) {
      const parsed = JSON.parse(fs.readFileSync(cfgPath, "utf-8"));
      if (parsed.authToken) return parsed.authToken;
    }
  } catch {
    // ignore
  }
  return null;
}

// Convert Markdown text to Sanity Portable Text blocks
function convertMarkdownToPortableText(markdown: string): any[] {
  if (!markdown) return [];
  const lines = markdown.split("\n");
  const blocks: any[] = [];
  let blockIndex = 1;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith("## ")) {
      blocks.push({
        _type: "block",
        _key: `blk_${blockIndex++}`,
        style: "h2",
        markDefs: [],
        children: [{ _type: "span", _key: `spn_${blockIndex++}`, text: line.replace(/^##\s+/, ""), marks: [] }]
      });
    } else if (line.startsWith("### ")) {
      blocks.push({
        _type: "block",
        _key: `blk_${blockIndex++}`,
        style: "h3",
        markDefs: [],
        children: [{ _type: "span", _key: `spn_${blockIndex++}`, text: line.replace(/^###\s+/, ""), marks: [] }]
      });
    } else if (line.startsWith("> ")) {
      blocks.push({
        _type: "block",
        _key: `blk_${blockIndex++}`,
        style: "blockquote",
        markDefs: [],
        children: [{ _type: "span", _key: `spn_${blockIndex++}`, text: line.replace(/^>\s+/, ""), marks: [] }]
      });
    } else {
      blocks.push({
        _type: "block",
        _key: `blk_${blockIndex++}`,
        style: "normal",
        markDefs: [],
        children: [{ _type: "span", _key: `spn_${blockIndex++}`, text: line, marks: [] }]
      });
    }
  }

  return blocks;
}

// Run a Gemini call with automatic fallback to a lighter, higher-quota model
// on 429 / quota errors. Grounding tools (googleSearch) have a tiny separate
// free-tier quota, so the retry also drops them.
async function generateWithFallback(
  client: GoogleGenAI,
  args: { model: string; contents: any; config?: any }
) {
  const modelToUse = sanitizeModel(args.model);
  const FALLBACK = sanitizeModel(process.env.GEMINI_FALLBACK_MODEL || "gemini-3.8-flash");
  try {
    return await client.models.generateContent({ ...args, model: modelToUse });
  } catch (err: any) {
    const msg = String(err?.message || err);
    const isRetryable = err?.status === 429 || err?.status === 404 || /429|404|RESOURCE_EXHAUSTED|quota|rate.?limit|no longer available/i.test(msg);
    if (!isRetryable) throw err;
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
    return "המכסה של Gemini נוצלה כרגע. המערכת עוברת אוטומטית ל-Gemini 3.8 Flash, או שניתן לנסות שוב בעוד דקה.";
  }
  if (err?.status === 404 || /not.?found|no longer available/i.test(msg)) {
    return "המודל המבוקש עודכן על ידי גוגל ל-Gemini 3.8 Flash.";
  }
  return msg || "שגיאה לא צפויה";
}

// Fetch live Google Israel SERP results via SerpApi (https://serpapi.com).
// Uses a 3.5s hard timeout so external network issues never hang the server.
// Returns null when no SERPAPI_KEY is configured or on timeout/network failure.
async function fetchSerpResults(query: string) {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey || !query) return null;

  try {
    const params = new URLSearchParams({
      engine: "google",
      q: query,
      google_domain: "google.co.il",
      gl: "il",
      hl: "he",
      num: "10",
      api_key: apiKey,
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const resp = await fetch(`https://serpapi.com/search.json?${params.toString()}`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!resp.ok) return null;
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
  } catch {
    return null;
  }
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
      // Lightweight fast model for competitor analysis
      model: process.env.COMPETITOR_MODEL || "gemini-3.8-flash",
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

    let serpKeywords = "";
    try {
      const serp = await fetchSerpResults(seedKeyword);
      if (serp) {
        const ideas = [...serp.relatedSearches, ...serp.relatedQuestions];
        if (ideas.length) {
          serpKeywords = `\n\nביטויי חיפוש אמיתיים מגוגל ישראל (SerpApi) עבור "${seedKeyword}":\n${ideas.map((k) => `- ${k}`).join("\n")}\n`;
        }
      }
    } catch {
      // ignore
    }

    const prompt = `אתה אסטרטג SEO בכיר ומומחה למחקר מילות מפתח אורגניות בגוגל ישראל עבור המותג "מצפן הלב" (יוסי מדלסי · מומחה לשחרור דפוסים, הדרכת הורים למתבגרים, אימון רגשי לנוער ומשברי גיל ההתבגרות).

בצע מחקר מילות מפתח מעמיק, ממוקד ומניב עבור:
ביטוי בסיס / מילת מפתח ראשית: "${seedKeyword}"
נושא נלווה: "${topic || "הדרכת הורים למתבגרים, אימון רגשי לנוער ושחרור דפוסים"}"${serpKeywords}${excludeNote}

חוקי ברזל מחייבים לרלוונטיות (Relevance Hard Rules):
1. **התאמה מלאה למצפן הלב:** כל מילות המפתח המוצעות חייבות לייצג שאלות, מצוקות וכוונות חיפוש של הורים ונוער המחפשים מענה רגשי, הדרכה, ויסות רגשי, שחרור דפוסים, התמודדות עם התפרצויות זעם, ניכור, חרדות חברתיות, משברי גיל ההתבגרות וקשר משפחתי.
2. **איסור מוחלט על נושאים לא רלוונטיים:** אסור בתכלית האיסור לכלול ביטויים בירוקרטיים (הסכמי גירושין, ביטוח לאומי, מענקים), לימודיים-טכניים (בגרויות, משרד החינוך, ציונים), הגדרות ביולוגיות של ספרי לימוד, או טיפולים תרופתיים/פסיכיאטריים.
3. **כוונות חיפוש אמיתיות:** התמקד בביטויי זנב ארוך (Long-tail) שהורים או צעירים באמת מקלידים כשהם חווים קושי ומחפשים ליווי או פתרון מעשי (Commercial, Transactional, High-Value Informational).
4. **מדדים מציאותיים לשוק הישראלי:** נפחי חיפוש ועלויות קליק ריאליים לגוגל ישראל.

החזר אך ורק מערך JSON תקין המכיל בדיוק 8-10 מילות מפתח במבנה הבא:
[
  {
    "keyword": "מילת המפתח המוצעת בעברית",
    "searchVolume": 1400,
    "difficulty": 32,
    "cpc": 2.80,
    "intent": "Commercial" | "Informational" | "Transactional" | "Navigational",
    "kei": 24.5,
    "seoValue": "High" | "Medium" | "Low",
    "relevanceToTopic": 10,
    "suggestedAction": "המלצה אסטרטגית קונקרטית בעברית"
  }
]`;

    const response = await generateWithFallback(client, {
      model: sanitizeModel(process.env.KEYWORD_MODEL || "gemini-3.8-flash"),
      contents: prompt,
      config: {
        systemInstruction: "You are an elite Israeli SEO strategist specialized in emotional coaching and parenting keywords for 'מצפן הלב'. You output strictly valid JSON with realistic metrics and 100% niche relevance.",
        responseMimeType: "application/json",
      },
    });

    const resultText = response.text || "[]";
    const data = parseJSONResponse(resultText);
    res.json({ keywords: data });
  } catch (error: any) {
    console.error("Error in search-keywords:", error);
    res.status(500).json({ error: friendlyError(error) });
  }
});

// 3. SEO & GEO Article Generator Router (HeartCompass Growth Doctrine & 2026 Engine Alignment)
app.post("/api/seo/generate-article", async (req, res) => {
  try {
    const { keyword, audience, tone, additionalKeywords, guidelines, useSearch, selectedModel } = req.body;
    if (!keyword) {
      return res.status(400).json({ error: "חובה לספק מילת מפתח ראשית לייצור המאמר" });
    }

    const client = getAIClient();
    const modelName = selectedModel || process.env.ARTICLE_MODEL || "gemini-3.8-flash";

    let searchGuidance = "";
    if (useSearch) {
      searchGuidance = `\nהערה קריטית: מופעל כעת חיפוש רשת חי (Google Search Grounding). חובה עליך לבצע שאילתות בגוגל על הנושא '${keyword}', ועל שאלות חיפוש עדכניות של הורים/מתבגרים בישראל נכון לשנת 2026 כדי להפיק טקסט מדויק, רלוונטי, ומלא בעובדות ודוגמאות אמיתיות מהמציאות הנוכחית בארץ.`;
    }

    const prompt = `כתוב מאמר עומק מותאם למנועי חיפוש ו-AI (גוגל, Gemini, ChatGPT, Perplexity) עבור אתר "מצפן הלב" של יוסי מדלסי (https://www.heartcompass.co.il).
מילת מפתח ראשית: ${keyword}
קהל יעד: ${audience || "הורים למתבגרים, נוער, וזוגות"}
סגנון כתיבה (Tone): ${tone || "סמכותי וחברי בו זמנית, אדם שעבר, בגובה העיניים, סקרן, אנושי"}
מילות מפתח נוספות לשילוב: ${additionalKeywords || "ללא מילות מפתח נוספות"}
הנחיות מיוחדות מהלקוח: ${guidelines || "אין משהו מיוחד"}${searchGuidance}

=======================================================
מקור האמת: דוקטרינת "מערכת הצמיחה" של מצפן הלב
=======================================================
1. תפיסת העולם והבידול המרכזי:
- "אנשים לא נתקעים כי חסר להם ידע (בעידן ה-AI יש לכולם פסיכולוג בכיס וכל תשובה בעולם), אלא כי פחדים, אמונות ודפוסים שנוצרו פעם כדי להגן ממשיכים לנהל את הבחירות שלהם."
- "המוח מעדיף את הסבל המוכר על פני אי-הוודאות של שקט."
- שורש מול סימפטום: התנהגות קשה, הסתגרות בחדר, מסכים, שקרים, מאבקי כוח, חרדות או ציונים ירודים הם לא הבעיה האמיתית. הם הסימפטום והפתרון ההישרדותי שהמוח מצא כדי לשמור על האדם מפגיעה. לכן אנחנו לא מנסים 'לתקן את הילד בכוח', אלא מזהים על מה הדפוס מגן ומשנים את המערכת והשפה.

2. נוסחת חמשת השלבים של שיטת מ.ס.ע (חובה למבנה גוף המאמר):
- פתיחה (ללא כותרת H2): מה הילד עושה / מה האדם חווה (הסימפטום). תרחיש ספציפי, מציאותי וכואב מהיומיום (100-150 מילים).
- H2 ראשון (שלב ה-מ': מיפוי): מה זה מפעיל בהורה / בנו ("הילד שבתוך ההורה"). למה אנחנו נבהלים מההסתגרות שלו? למה חייבים לשלוט? חיבור פסיכולוגי/נוירולוגי עדין.
- H2 שני (שלב ה-ס': סילוק): למה אנחנו מגיבים ככה. חקירת הסיפור שהמוח מספר לעצמו ("אם הוא נכשל אני נכשלתי?"). פירוק אמונות מגבילות שירשנו מהילדות. (שים לב: אין שלב סלילה בשיטה! השלבים הם אך ורק: מיפוי, סילוק, עצמאות).
- H2 שלישי: מה הילד לומד על עצמו מהתגובה הזו (הזהות המתעצבת מול תגובת ההורים).
- H2 רביעי (שלב ה-ע': עצמאות): איך מ.ס.ע משנה את כל המעגל. מעבר מפעולה מתוך פחד לפעולה מתוך מה שהילד באמת צריך. כלים מעשיים לעצירת הלופ.
- סיום משמעותי: הבטחה מותגית ושאלת זהות פתוחה שנשארת עם הקורא בגוף. לעולם ללא CTA שיווקי קר ("צרו קשר עכשיו") בגוף הטקסט!

3. חמש האוטוריטות המחקריות המאושרות (שלב לפחות מושג/ממצא אחד מובלע בעדינות):
- פרופ' חיים עומר: סמכות מעגנת, נוכחות הורית שקטה, הימנעות מ"מלכוד ההסברים", "להכות בברזל כשהוא קר".
- ד"ר דן סיגל: המוח הדו-קומתי, היפוך המוח (Flipping the lid), ויסות רגשי משותף (Co-regulation).
- אלפרד אדלר: הצורך בשייכות ומשמעות, מאבק כוח כמטרה מוטעית של מתבגר מיואש, עידוד מול שבח.
- דונלד ויניקוט: ההורה הטוב דיו (Good enough parent), החזקה רגשית (Holding), הישרדות ההורה מול תוקפנות המתבגר.
- ד"ר מרשל רוזנברג: תקשורת לא-אלימה (NVC), שפת הג'ירפה מול שפת התן, התנהגות קשה כביטוי טרגי של צורך לא מסופק.

4. חוקי הברזל לשפה ולסגנון (עברית נקייה ללא סימני AI):
- אסור מוחלט על מקפים ארוכים (—) בשום צורה. השתמש בנקודה, פסיק, נקודתיים או סוגריים.
- אסור מרכאות סרק (Scare quotes) סביב מילים (לא 'דווקא', לא 'נכון').
- אסור פתיחות נוסחתיות וקלישאות ("בעידן המודרני", "בעולם של היום", "רבים מאיתנו", "כולנו מכירים", "האם גם אתם").
- אסור מילות AI: "מהווה", "להוות", "משמש כ", "הינו/הינה", "מתאפיין ב", "לייצר ערך/קשר/תחושה", "חשוב לציין", "יש לציין", "ראוי להדגיש".
- אסור "בנוסף" / "יתרה מכך" בראש פסקאות.
- שורת מחבר: "יוסי מדלסי · מומחה לשחרור דפוסים" (עם נקודה אמצעית).

=======================================================
התאמה למנועי חיפוש ו-GEO (Generative Engine Optimization 2026):
=======================================================
- title: שאלת חיפוש ישירה שישראלים מקלידים (עד 70 תווים), הכוללת את מילת המפתח.
- goldLine: שורת מסגור אחת קצרה ומסקרנת של המנגנון (עד 12 מילים).
- excerpt: תקציר ענייני ומדויק של 150-160 תווים לגוגל ולכרטיס באתר.
- aiCitation: משפט הגדרה עצמאי אחד וחד, המשלב מחקר ומספרים, שמנועי AI (גוגל AI Overviews, Gemini, Perplexity) ישלפו כתשובה מלאה.
- disambiguatingDescription: 2-4 משפטים המסבירים לזחלני AI בדיוק במה המאמר עוסק ובמה הוא אינו עוסק.
- keyTakeaways: כותרת ו-4-5 נקודות תמציתיות של תובנות מהירות ל-Featured Snippets.
- painTags: 4-6 מילות מפתח וכאבים מדויקים בעברית.
- searchPhrases: 5-7 ביטויי ושאלות Long-tail שאנשים מחפשים בפועל.
- domain: אחד מתוך: "parents", "youth", "personal", "relationships".
- contentRole: "supporting" (ברירת מחדל), "pillar", או "money".
- searchIntent: "informational" (ברירת מחדל), "commercial", או "transactional".
- insightPlacement: קטגוריה ועוגן רשמי מהאתר בלבד (למשל: parents -> "הדפוסים והתגובות שלי כהורה" עם קטגוריית משנה "גבולות, מריבות ושגרה בבית").
- sources: 3-4 מקורות אקדמיים/מחקריים איכותיים.
- cta: בלוק קריאה לפעולה מלא הכולל וואטסאפ ליוסי: https://wa.me/972544580285.
- jsonLdSchema: סכמת Schema.org מלאה ב-JSON-LD (@graph המכיל Article, FAQPage ו-Person של יוסי מדלסי).

החזר את התוצאה אך ורק במבנה ה-JSON הבא (ללא טקסט עודף מחוץ ל-JSON):
{
  "id": "art_${Date.now()}",
  "keyword": "${keyword}",
  "title": "כותרת בנוסח שאלת חיפוש אמיתית (עד 70 תווים)",
  "goldLine": "תת-כותרת המנגנון, משפט אחד חד עד 12 מילים",
  "metaTitle": "כותרת SEO עד 60 תווים | מצפן הלב",
  "metaDescription": "תיאור מטא ענייני ומניע לפעולה עד 155 תווים",
  "excerpt": "תקציר ענייני של 150-160 תווים לכרטיס באתר ולגוגל",
  "urlSlug": "english-keyword-slug-with-hyphens",
  "authorLine": "יוסי מדלסי · מומחה לשחרור דפוסים",
  "imageAlt": "תיאור אלט אמפתי ומדויק לתמונה הראשית כולל מילת המפתח",
  "tags": ["הורות", "נוער"],
  "domain": "parents",
  "contentRole": "supporting",
  "searchIntent": "informational",
  "painTags": ["כאב 1", "מילת חיפוש 2", "חרדה 3", "דפוס 4"],
  "disambiguatingDescription": "מאמר זה עוסק ב... מיועד ל... ואינו עוסק ב...",
  "keyTakeaways": {
    "heading": "מה תלמדו במאמר",
    "items": ["נקודה מפתח 1", "נקודה 2", "נקודה 3", "נקודה 4"]
  },
  "aiCitation": "משפט תשובה עצמאי מלא עם נתוני מחקר ומספרים לציטוט ב-AI Overviews",
  "aiContext": "הקשר נוסף למנועי AI אודות קהל היעד והמסגרת המחקרית",
  "searchPhrases": ["שאילתת זנב ארוך 1?", "איך להתמודד עם 2?", "למה קורה 3?"],
  "relatedToMethod": false,
  "insightPlacement": {
    "domain": "parents",
    "category": "הדפוסים והתגובות שלי כהורה",
    "secondary": [
      { "domain": "parents", "category": "גבולות, מריבות ושגרה בבית" }
    ]
  },
  "wordCount": 950,
  "outline": [
    { "sectionTitle": "כותרת ביניים המנגנון", "description": "תמצית קצרה" }
  ],
  "content": "גוף המאמר המלא לפי 5 השלבים של מ.ס.ע בפורמט Markdown...",
  "bodyHtml": "אותו גוף מאמר בדיוק כ-HTML עם dir=\\"rtl\\" בכל בלוק (<p dir=\\"rtl\\">, <h2 dir=\\"rtl\\">), בלי מקפים ארוכים, מוכן לסאניטי",
  "faqs": [
    { "question": "שאלה 1: הגדרה בסיסית?", "answer": "תשובה ישירה" },
    { "question": "שאלה 2: האם ניתן לשנות/ללמוד את זה?", "answer": "תשובה" },
    { "question": "שאלה 3: שאלת כאב ספציפית שההורה שואל ב-2 בלילה?", "answer": "תשובה אנושית ישירה" },
    { "question": "שאלה 4: מה עושים צעד ראשון מעשי?", "answer": "תשובה מעשית" }
  ],
  "sources": [
    {
      "title": "שם המחקר/ספר",
      "authors": "שם החוקר (למשל: ד\"ר דן סיגל)",
      "year": "2023",
      "publisher": "הוצאה/כתב עת",
      "url": "https://...",
      "note": "ממצא עיקרי במשפט",
      "sourceType": "academic"
    }
  ],
  "cta": {
    "heading": "רוצים להבין מה קורה עם הילד שלכם?",
    "text": "שיחה אישית אחת יכולה לשנות את כל הדינמיקה בבית ולהחזיר את הרוגע לקשר.",
    "buttonLabel": "אני רוצה להבין מה קורה עם הילד שלי",
    "buttonHref": "https://wa.me/972544580285"
  },
  "seoTips": ["טיפ אופטימיזציה לדירוג", "טיפ לקישור פנימי"],
  "jsonLdSchema": {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        "headline": "כותרת המאמר",
        "description": "תיאור מטא",
        "author": {
          "@type": "Person",
          "name": "יוסי מדלסי",
          "jobTitle": "מומחה לשחרור דפוסים ומפתח שיטת מ.ס.ע",
          "url": "https://www.heartcompass.co.il"
        },
        "publisher": {
          "@type": "Organization",
          "name": "מצפן הלב",
          "url": "https://www.heartcompass.co.il"
        }
      },
      {
        "@type": "FAQPage",
        "mainEntity": []
      }
    ]
  }
}`;

    const config: any = {
      systemInstruction: "You are Yossi Medalsi's elite content architect and GEO/SEO strategist for the Israeli brand 'מצפן הלב' (HeartCompass - https://www.heartcompass.co.il). You master the M.S.A method (Mapping, Clearing, Independence) and write emotionally precise, research-grounded Hebrew articles in his voice: story first, semantic GEO layer second. You strictly avoid em-dashes, formulaic openings, and AI cliché words.",
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
    const modelName = selectedModel || process.env.ARTICLE_MODEL || "gemini-3.8-flash";

    let searchGuidance = "";
    if (useSearch) {
      searchGuidance = `\nהערה קריטית: מופעל כעת חיפוש רשת חי (Google Search Grounding). חובה עליך להשתמש בכלי החיפוש גוגל כדי למצוא עובדות רלוונטיות, טרנדים או מידע חדש לשילוב במאמר לפי הנחיית המשתמש.`;
    }

    const prompt = `אתה עורך תוכן ועיתונאי SEO/GEO בכיר עבור המותג 'מצפן הלב' של יוסי מדלסי (https://www.heartcompass.co.il). המשימה שלך היא לערוך ולשפר מאמר קיים בהתאם להנחיות המשתמש, תוך שמירה מוחלטת על שיטת מ.ס.ע, חוקי הקול והסגנון (ללא מקפיים ארוכים, ללא מילות AI, שורת מחבר 'יוסי מדלסי · מומחה לשחרור דפוסים') ועדכון כל שדות ה-Sanity וה-GEO הרלוונטיים.

הפרטים של המאמר המקורי:
- כותרת המאמר: ${article.title}
- מילת מפתח ראשית: ${article.keyword}
- כותרת מטא: ${article.metaTitle || ""}
- תיאור מטא: ${article.metaDescription || ""}
- סלאג: ${article.urlSlug || ""}
- תחום וסיווג: ${article.domain || "parents"} / ${article.contentRole || "supporting"}

התוכן הנוכחי של המאמר בפורמט Markdown:
${article.content}

הנחיות העריכה והשיפור המבוקשות של המשתמש:
"${editPrompt}"${searchGuidance}

עליך לבצע את העריכה המבוקשת בצורה מדויקת, עקבית ומקצועית במיוחד, תוך שמירה על כל שדות הסכימה המלאים של Sanity ו-GEO.
החזר אך ורק מבנה JSON תואם ומלא (כולל title, goldLine, excerpt, metaTitle, metaDescription, content, bodyHtml, aiCitation, disambiguatingDescription, keyTakeaways, painTags, domain, searchIntent, sources, cta, faqs, jsonLdSchema):
{
  "id": "${article.id || "art_" + Date.now()}",
  "keyword": "${article.keyword}",
  "title": "הכותרת המעודכנת",
  "goldLine": "תת-כותרת המנגנון המעודכנת (עד 12 מילים)",
  "metaTitle": "SEO Title מעודכן עד 60 תווים",
  "metaDescription": "Meta Description מעודכן עד 155 תווים",
  "excerpt": "תקציר ענייני מעודכן של 150-160 תווים",
  "urlSlug": "${article.urlSlug || "updated-slug"}",
  "authorLine": "יוסי מדלסי · מומחה לשחרור דפוסים",
  "imageAlt": "תיאור alt מדויק",
  "tags": ${JSON.stringify(article.tags || ["הורות"])},
  "domain": "${article.domain || "parents"}",
  "contentRole": "${article.contentRole || "supporting"}",
  "searchIntent": "${article.searchIntent || "informational"}",
  "painTags": ${JSON.stringify(article.painTags || ["הורות", "דפוסים"])},
  "disambiguatingDescription": "הסבר מה המאמר עוסק ומה לא",
  "keyTakeaways": { "heading": "מה תלמדו במאמר", "items": ["נקודה 1", "נקודה 2", "נקודה 3"] },
  "aiCitation": "משפט הגדרה עצמאי עם מחקר לציטוט ב-AI",
  "aiContext": "הקשר נוסף ל-AI",
  "searchPhrases": ["שאילתה 1", "שאילתה 2"],
  "relatedToMethod": ${Boolean(article.relatedToMethod)},
  "insightPlacement": ${JSON.stringify(article.insightPlacement || { domain: "parents", category: "הדפוסים והתגובות שלי כהורה" })},
  "wordCount": 950,
  "outline": [
    { "sectionTitle": "שם הפרק", "description": "תמצית קצרה" }
  ],
  "content": "התוכן המלא המעודכן בפורמט Markdown...",
  "bodyHtml": "אותו תוכן מעודכן כ-HTML עם dir=\\"rtl\\" בכל בלוק, מוכן ל-Sanity, ללא מקפים ארוכים",
  "faqs": [
    { "question": "שאלה נפוצה", "answer": "תשובה קצרה ומדויקת" }
  ],
  "sources": ${JSON.stringify(article.sources || [])},
  "cta": ${JSON.stringify(article.cta || { heading: "רוצים להבין מה קורה עם הילד שלכם?", text: "שיחה אישית אחת יכולה לשנות את הדינמיקה בבית.", buttonLabel: "אני רוצה להבין מה קורה עם הילד שלי", buttonHref: "https://wa.me/972544580285" })},
  "seoTips": ["טיפ ראשון", "טיפ שני"],
  "jsonLdSchema": ${JSON.stringify(article.jsonLdSchema || { "@context": "https://schema.org", "@type": "Article" })}
}`;

    const config: any = {
      systemInstruction: "You are an elite SEO/GEO chief editor for 'מצפן הלב'. Your goal is to rewrite, refine, expand, or correct text to perfection while ensuring the highest alignment with search algorithms, AI Overviews citation standards, and Yossi Medalsi's voice.",
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
      model: process.env.AUDIT_MODEL || "gemini-3.8-flash",
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
      model: process.env.CHAT_MODEL || "gemini-3.8-flash",
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
  const sanityToken = getSanityToken();
  res.json({
    gemini: Boolean(process.env.GEMINI_API_KEY),
    serpapi: Boolean(process.env.SERPAPI_KEY),
    searchConsole: Boolean(process.env.VITE_GSC_SITE_URL),
    sanity: Boolean(sanityToken),
  });
});

// 7. Sanity CMS Direct Draft Sync Router (One-Click Draft Creation in Production Sanity)
app.post("/api/sanity/push-draft", async (req, res) => {
  try {
    const { article } = req.body;
    if (!article || !article.title || !article.urlSlug) {
      return res.status(400).json({ error: "חובה לספק מאמר עם כותרת וסלאג תקינים" });
    }

    const token = getSanityToken();
    if (!token) {
      return res.status(401).json({ error: "טוקן אימות של Sanity (SANITY_AUTH_TOKEN) חסר. הגדר אותו בהגדרות המערכת או ב-config.json של Sanity CLI." });
    }

    const projectId = process.env.VITE_SANITY_PROJECT_ID || "bk4y5jiw";
    const dataset = process.env.VITE_SANITY_DATASET || "production";
    const authorId = process.env.SANITY_AUTHOR_ID || "73458909-2928-4308-9c54-983ca1fadb18";

    // Clean slug for draft ID
    const cleanSlug = article.urlSlug.replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase();
    const draftId = `drafts.${cleanSlug}`;

    const doc: any = {
      _id: draftId,
      _type: "article",
      title: article.title,
      slug: { _type: "slug", current: cleanSlug },
      goldLine: article.goldLine || "",
      excerpt: article.excerpt || article.metaDescription || "",
      publishedAt: new Date().toISOString().split("T")[0],
      author: { _type: "reference", _ref: authorId },
      authorLine: article.authorLine || "יוסי מדלסי · מומחה לשחרור דפוסים",
      tags: Array.isArray(article.tags) && article.tags.length ? article.tags : ["הורות"],
      domain: article.domain || "parents",
      contentRole: article.contentRole || "supporting",
      searchIntent: article.searchIntent || "informational",
      painTags: Array.isArray(article.painTags) ? article.painTags : [],
      disambiguatingDescription: article.disambiguatingDescription || "",
      keyTakeaways: article.keyTakeaways || { heading: "מה תלמדו במאמר", items: [] },
      aiCitation: article.aiCitation || "",
      aiContext: article.aiContext || "",
      searchPhrases: Array.isArray(article.searchPhrases) ? article.searchPhrases : [],
      relatedToMethod: Boolean(article.relatedToMethod),
      faqItems: (article.faqs || []).map((faq: any, i: number) => ({
        _key: `faq_${i + 1}`,
        question: faq.question,
        answer: faq.answer,
      })),
      sources: (article.sources || []).map((src: any, i: number) => ({
        _key: `src_${i + 1}`,
        _type: "source",
        title: src.title,
        authors: src.authors || "",
        year: src.year || "",
        publisher: src.publisher || "",
        url: src.url || "",
        note: src.note || "",
        sourceType: src.sourceType || "academic",
      })),
      cta: article.cta || {
        heading: "רוצים להבין מה קורה עם הילד שלכם?",
        text: "שיחה אישית אחת יכולה לשנות את כל הדינמיקה בבית ולהחזיר את הרוגע לקשר.",
        buttonLabel: "אני רוצה להבין מה קורה עם הילד שלי",
        buttonHref: "https://wa.me/972544580285",
      },
      seo: {
        title: article.metaTitle || article.title,
        description: article.metaDescription || article.excerpt,
      },
      body: convertMarkdownToPortableText(article.content || ""),
    };

    if (article.insightPlacement) {
      doc.insightPlacement = {
        _type: "insightPlacement",
        domain: article.insightPlacement.domain || "parents",
        category: article.insightPlacement.category || "הדפוסים והתגובות שלי כהורה",
        ...(article.insightPlacement.secondary && Array.isArray(article.insightPlacement.secondary)
          ? {
              secondary: article.insightPlacement.secondary.map((sec: any, idx: number) => ({
                _key: `sec_${idx + 1}`,
                _type: "insightSecondaryPlacement",
                domain: sec.domain,
                category: sec.category,
              })),
            }
          : {}),
      };
    }

    const mutateUrl = `https://${projectId}.api.sanity.io/v2021-10-21/data/mutate/${dataset}`;
    const response = await fetch(mutateUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mutations: [{ createOrReplace: doc }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`שגיאת Sanity (${response.status}): ${errText}`);
    }

    const resData: any = await response.json();
    res.json({
      success: true,
      draftId,
      slug: cleanSlug,
      sanityResult: resData,
      studioUrl: `https://${projectId}.sanity.studio/desk/article;${draftId}`,
    });
  } catch (error: any) {
    console.error("Error in push-draft to Sanity:", error);
    res.status(500).json({ error: error.message || "שגיאה בשמירת הטיוטה ב-Sanity" });
  }
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

// 9. Cannibalization Guard Router — checks new keyword against all published Sanity articles
app.post("/api/seo/check-cannibalization", async (req, res) => {
  try {
    const { keyword, topic } = req.body;
    if (!keyword) {
      return res.status(400).json({ error: "חובה לספק מילת מפתח לבדיקת קניבליזציה" });
    }

    const projectId = process.env.VITE_SANITY_PROJECT_ID || "bk4y5jiw";
    const dataset = process.env.VITE_SANITY_DATASET || "production";
    const groq = '*[_type=="article" && defined(slug.current)]{title,"slug":slug.current,tags,excerpt,goldLine}';
    const url = `https://${projectId}.api.sanity.io/v2021-10-21/data/query/${dataset}?query=${encodeURIComponent(groq)}`;

    let articles: any[] = [];
    try {
      const resp = await fetch(url);
      if (resp.ok) {
        const data: any = await resp.json();
        articles = data.result || [];
      }
    } catch (e) {
      console.warn("Could not fetch Sanity articles for cannibalization check:", e);
    }

    const kwTokens = String(keyword)
      .toLowerCase()
      .split(/[\s,.-]+/)
      .filter((t) => t.length > 2);

    const candidates = articles
      .map((a) => {
        let matchCount = 0;
        const text = `${a.title || ""} ${a.excerpt || ""} ${a.goldLine || ""} ${(a.tags || []).join(" ")}`.toLowerCase();
        kwTokens.forEach((tok) => {
          if (text.includes(tok)) matchCount += 1;
        });
        const similarityScore = kwTokens.length > 0 ? Math.round((matchCount / kwTokens.length) * 100) : 0;
        return {
          title: a.title,
          slug: a.slug,
          goldLine: a.goldLine,
          similarityScore,
        };
      })
      .filter((c) => c.similarityScore >= 25)
      .sort((a, b) => b.similarityScore - a.similarityScore)
      .slice(0, 4);

    if (candidates.length === 0) {
      return res.json({
        hasRisk: false,
        score: 0,
        matchedArticles: [],
        suggestedFocusAngles: [
          `מיקוד בכאב המיידי וחסר האונים של הורים ביומיום סביב "${keyword}"`,
          `זווית נוירולוגית של חקר המוח המתבגר (ד"ר דן סיגל)`,
          `זווית מעשית של תקשורת מקרבת ללא מאבקי כוח (NVC)`,
        ],
        recommendation: "לא נמצאה חפיפה משמעותית עם מאמרי האתר. הנושא פנוי לכתיבה כמאמר דגל!",
      });
    }

    const client = getAIClient();
    const prompt = `אתה אסטרטג תוכן ו-SEO של אתר "מצפן הלב" (https://www.heartcompass.co.il).
נבדקת מילת המפתח: "${keyword}".
נושא נלווה: "${topic || ""}"

נמצאו המאמרים הקיימים הבאים באתר שעלולים ליצור חפיפה וקניבליזציה בגוגל:
${candidates.map((c, i) => `${i + 1}. "${c.title}" (slug: ${c.slug}) — ${c.goldLine || "ללא תקציר"}`).join("\n")}

הערך את רמת הסיכון לקניבליזציה (מ-0 עד 100), הסבר מה כל מאמר קיים כבר מכסה, והצע 3-4 זוויות פוקוס ייחודיות (Differentiated Angles) שיבדלו את המאמר החדש לחלוטין וימנעו תחרות פנימית, בהתאם לדוקטרינת שיטת מ.ס.ע.

החזר אך ורק בפורמט JSON הבא (בלי שום טקסט מחוץ ל-JSON):
{
  "hasRisk": true,
  "score": 65,
  "recommendation": "המלצה אסטרטגית קצרה ומעשית מה לעשות כדי למנוע קניבליזציה",
  "matchedArticles": [
    ${candidates.map((c) => `{ "title": "${c.title}", "slug": "${c.slug}", "similarityScore": ${c.similarityScore}, "reason": "מדוע יש חפיפה ומה המאמר הקיים כבר מכסה" }`).join(",\n")}
  ],
  "suggestedFocusAngles": [
    "זווית ייחודית 1 שתמנע קניבליזציה",
    "זווית ייחודית 2",
    "זווית ייחודית 3"
  ]
}`;

    const resp = await client.models.generateContent({
      model: process.env.AUDIT_MODEL || "gemini-3.8-flash",
      contents: prompt,
      config: {
        systemInstruction: "You are an elite SEO strategist specializing in keyword cannibalization prevention and content differentiation for HeartCompass.",
        responseMimeType: "application/json",
      },
    });

    const parsed = parseJSONResponse(resp.text || "{}");
    res.json(parsed);
  } catch (err: any) {
    console.error("Error in check-cannibalization:", err);
    res.status(500).json({ error: err.message || "שגיאה בבדיקת קניבליזציה" });
  }
});

// 10. Content Flywheel (Full 360 Campaign Generator) — Transforms an article into an entire multi-channel organic growth campaign
app.post("/api/campaign/generate-360", async (req, res) => {
  try {
    const { article } = req.body;
    if (!article || !article.title) {
      return res.status(400).json({ error: "חובה לספק מאמר לייצור קמפיין 360" });
    }

    const client = getAIClient();
    const articleTitle = article.title;
    const articleSlug = article.urlSlug || "article";
    const keyword = article.keyword || articleTitle;
    const content = (article.content || "").slice(0, 5000);
    const domain = article.domain || "parents";

    const availableTools = [
      { title: "שאלון אבחון אישי: איזה דפוס פועל בך כשההצפה מתחילה", path: "/guide/coping-style-quiz", domain: "personal", keywords: ["דפוס", "חרדה", "הצפה", "לחץ", "שינוי"] },
      { title: "מפענח רגעי הפיצוץ: עצירה של 60 שניות לפני שמגיבים (Parenting Pause)", path: "/tools/parent-conflict-pause", domain: "parents", keywords: ["מריבה", "פיצוץ", "התפרצות", "כעס", "ויכוח", "זעם"] },
      { title: "שאלון אבחון להורים: איזה הורה אתה ברגע הקשה", path: "/guide/parent-type-quiz", domain: "parents", keywords: ["הורה", "הורות", "תגובה", "מתבגר", "שליטה"] },
      { title: "המדריך לחיבור לערך עצמי יציב: פרפקציוניזם, ריצוי ותדמית", path: "/guide/stable-self-worth-guide", domain: "personal", keywords: ["ערך עצמי", "ריצוי", "ביקורת", "פרפקציוניזם", "בושה"] },
      { title: "המדריך לשחרור מחשבות יתר ולופים מחשבתיים", path: "/guide/overthinking-release-guide", domain: "personal", keywords: ["מחשבות", "חשיבת יתר", "רומינציה", "ספק", "דאגה"] },
      { title: "המדריך לשיחה שלא הופכת לחקירה", path: "/guide/teen-conversation-guide", domain: "youth", keywords: ["שיחה", "תקשורת", "חקירה", "מתבגר", "דיבור", "הסתגרות"] },
      { title: "המדריך להורים — מי הילד שלי בעצם", path: "/guide/parenting-guide-who-is-my-child", domain: "parents", keywords: ["נתק", "הסתגרות", "חדר", "ריחוק", "ניכור"] },
      { title: "משחק מסע אל מצפן הלב (אימון רגשי לנוער)", path: "/guide/youth-journey-game", domain: "youth", keywords: ["נוער", "משחק", "קלפים", "זהות", "חוסן"] },
      { title: "הילד אובחן עם הפרעת קשב וריכוז: צעדים ראשונים", path: "/guide/after-adhd-diagnosis-guide", domain: "parents", keywords: ["קשב", "ריכוז", "adhd", "אבחון"] },
    ];

    let bestTool = availableTools.find((t) => t.keywords.some((k) => keyword.includes(k) || articleTitle.includes(k)));
    if (!bestTool) {
      bestTool = domain === "parents" ? availableTools[1] : availableTools[0];
    }

    const prompt = `אתה מנהל הקמפיינים והתוכן הבכיר של המותג "מצפן הלב" של יוסי מדלסי (https://www.heartcompass.co.il).
המשימה שלך: להפוך את המאמר הבא לקמפיין צמיחה מלא ב-360 מעלות:
- כותרת המאמר: "${articleTitle}"
- מילת מפתח: "${keyword}"
- סלאג: "${articleSlug}"
- תקציר: "${article.excerpt || ""}"
- כלי מותאם באתר: "${bestTool.title}" (${bestTool.path})

תוכן המאמר:
${content}

חוקי הקול של מצפן הלב — מחייבים, אי-עמידה פוסלת את הפלט:
- אסור מקפים ארוכים (—).
- אסור פתיחות נוסחתיות ("רבים מאיתנו", "כולנו מכירים", "האם גם אתם", "בעידן המודרני").
- אסור CTA קר ("צרו קשר", "אני כאן בשבילכם").
- סמכותי, סקרן, אנושי וחברי. סיפור קודם, נקודה אחר כך.

דרישות הקמפיין ב-360 מעלות:
1. ניוזלטר מעוצב לרשימת תפוצה (3 שורות נושא, preview text, סצנה פותחת, גוף המייל, והנעה רכה לקריאת המאמר והתנסות בכלי).
2. פוסט פייסבוק סיפורי (בגוף שלישי "הוא/היא", עקרון הסוד המשותף, לולאה פתוחה).
3. פוסט אינסטגרם + מתווה קרוסלה של 5-6 שקופיות.
4. תסריט Reels / TikTok מלא (Hook של 3 שניות, 5-6 ביטים עם Timecodes, טקסט על המסך, Voiceover, וויזואל, וסאונד).

החזר אך ורק מבנה JSON תואם (ללא שום טקסט עודף מחוץ ל-JSON):
{
  "articleId": "${article.id || "art_1"}",
  "articleTitle": "${articleTitle}",
  "articleSlug": "${articleSlug}",
  "suggestedTool": {
    "title": "${bestTool.title}",
    "path": "${bestTool.path}",
    "reason": "מדוע כלי זה הוא ההמשך הטבעי והאבחוני עבור הקורא של מאמר זה"
  },
  "newsletter": {
    "subjectLines": ["נושא 1", "נושא 2", "נושא 3"],
    "previewText": "טקסט תצוגה מקדימה למייל",
    "openingScene": "סצנה פותחת מהקליניקה...",
    "body": "גוף הניוזלטר...",
    "callToAction": "הנעה רכה לקריאת המאמר המלא והתנסות בכלי"
  },
  "socialPosts": [
    {
      "platform": "facebook",
      "hookVariations": ["פתיח 1", "פתיח 2"],
      "caption": "כיתוב פייסבוק מלא בקול של יוסי...",
      "hashtags": [],
      "cta": "הנעה רכה",
      "visualIdea": "תמונה אותנטית מחיי היומיום"
    },
    {
      "platform": "instagram",
      "hookVariations": ["פתיח 1", "פתיח 2"],
      "caption": "כיתוב אינסטגרם נושם...",
      "hashtags": ["#מצפן_הלב", "#הורות", "#מתבגרים"],
      "cta": "שמרו את הפוסט או שתפו עם הורה שצריך את זה",
      "visualIdea": "קרוסלה ויזואלית נקייה"
    }
  ],
  "carousel": [
    { "slideTitle": "שקופית 1", "slideText": "טקסט קצר..." },
    { "slideTitle": "שקופית 2", "slideText": "טקסט קצר..." },
    { "slideTitle": "שקופית 3", "slideText": "טקסט קצר..." },
    { "slideTitle": "שקופית 4", "slideText": "טקסט קצר..." },
    { "slideTitle": "שקופית 5", "slideText": "טקסט קצר..." }
  ],
  "reels": {
    "hook": "משפט או פעולה ב-3 השניות הראשונות",
    "beats": [
      { "timecode": "0-3s", "onScreenText": "טקסט על המסך", "voiceover": "מה אומרים", "visual": "ויזואל" },
      { "timecode": "3-8s", "onScreenText": "טקסט", "voiceover": "דיבור", "visual": "ויזואל" },
      { "timecode": "8-15s", "onScreenText": "טקסט", "voiceover": "דיבור", "visual": "ויזואל" },
      { "timecode": "15-22s", "onScreenText": "טקסט", "voiceover": "דיבור", "visual": "ויזואל" },
      { "timecode": "22-30s", "onScreenText": "טקסט", "voiceover": "דיבור", "visual": "ויזואל" }
    ],
    "caption": "כיתוב נלווה לרילס בקול של יוסי",
    "hashtags": ["#מצפןהלב", "#הורות", "#מתבגרים"],
    "audioIdea": "מוזיקת רקע עמוקה ושקטה ללא מילים",
    "cta": "קישור למדריך המלא מחכה בפרופיל"
  }
}`;

    const resp = await generateWithFallback(client, {
      model: process.env.ARTICLE_MODEL || "gemini-3.8-flash",
      contents: prompt,
      config: {
        systemInstruction: "You are the head of content and brand campaigns for HeartCompass. You turn in-depth psychological/parenting articles into cohesive, high-converting 360-degree campaigns in Yossi Medalsi's exact voice.",
        responseMimeType: "application/json",
      },
    });

    const parsed = parseJSONResponse(resp.text || "{}");
    res.json({ campaign: parsed });
  } catch (err: any) {
    console.error("Error in generate-360 campaign:", err);
    res.status(500).json({ error: friendlyError(err) });
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
      sourceUrl = `https://www.heartcompass.co.il/articles/${slug}`;
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

    const prompt = `אתה אסטרטג תוכן לרשתות חברתיות של המותג "מצפן הלב" של יוסי מדלסי (אימון רגשי תודעתי לנוער, הורים וזוגות - https://www.heartcompass.co.il).
המשימה: להפוך את חומר המקור הבא לפוסטים מנצחים ל${platformLabel}.

כותרת/נושא המקור: ${sourceTitle || "ללא כותרת"}
${sourceUrl ? `קישור למאמר המלא: ${sourceUrl}` : ""}
מטרת הפוסט: ${goal || "מודעות ומעורבות (engagement), והנעה עדינה לקריאת המאמר/פנייה"}

חומר המקור:
${(sourceBody || "").slice(0, 6000)}

חוקי הקול של מצפן הלב — מחייבים, אי-עמידה פוסלת את הפוסט:

כללי פסילה מוחלטים:
- אסור מקפים ארוכים (—) בשום צורה.
- אסור פתיחות נוסחתיות ("רבים מאיתנו", "כולנו מכירים", "האם גם אתם", "בעידן המודרני").
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
      model: model || process.env.SOCIAL_MODEL || "gemini-3.8-flash",
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
      model: sanitizeModel(model || process.env.SOCIAL_MODEL || "gemini-3.8-flash"),
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
      model: sanitizeModel(model || process.env.COMPETITOR_MODEL || "gemini-3.8-flash"),
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
      model: sanitizeModel(model || process.env.SOCIAL_MODEL || "gemini-3.8-flash"),
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
