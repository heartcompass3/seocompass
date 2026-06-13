import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

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

// 1. Competitor Analysis Router
app.post("/api/seo/analyze-competitors", async (req, res) => {
  try {
    const { targetUrl, topic } = req.body;
    if (!targetUrl && !topic) {
      return res.status(400).json({ error: "חובה לספק כתובת אתר או נושא לניתוח" });
    }

    const client = getAIClient();
    
    const prompt = `בצע ניתוח מתחרים מעמיק ומקצועי עבור אתר האינטרנט או הנושא הבאים:
כתובת האתר: ${targetUrl || "לא צוין אתר ספציפי"}
הנושא/הנישה: ${topic || "ניתוח כללי של האתר"}

עליך לבצע מחקר אינטרנטי עדכני באמצעות כלי החיפוש של גוגל כדי למצוא את 3 המתחרים האורגניים המובילים של האתר או הנושא הזה בגוגל ישראל, ולאסוף נתונים מדויקים ככל הניתן של נתחי שוק, מילות מפתח מובילות, סמכות דומיין מוערכת (Domain Authority), פרופיל קישורים חיצוניים, בעיות On-page SEO נפוצות ואסטרטגיית התוכן שלהם.

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
    const { keyword, audience, tone, additionalKeywords, guidelines, useSearch } = req.body;
    if (!keyword) {
      return res.status(400).json({ error: "חובה לספק מילת מפתח ראשית לייצור המאמר" });
    }

    const client = getAIClient();

    let searchGuidance = "";
    if (useSearch) {
      searchGuidance = `\nהערה קריטית: מופעל כעת חיפוש רשת חי (Google Search Grounding). חובה עליך לבצע שאילתות בגוגל על הנושא '${keyword}' ועל הטרנדים ומילות המפתח האחרונות נכון לשנת 2026 כדי להפיק טקסט מדויק, רלוונטי, ומלא בעובדות ודוגמאות אמיתיות מהמציאות הנוכחית בארץ.`;
    }

    const prompt = `כתוב מאמר מקיף, מרתק, מעמיק ומותאם לחלוטין לקידום אורגני בגוגל (SEO Friendly), סביב מילת המפתח הראשית הבאה:
מילת מפתח ראשית: ${keyword}
קהל יעד: ${audience || "קהל כללי המתעניין בתחום"}
סגנון כתיבה (Tone): ${tone || "Professional and informative"}
מילות מפתח נוספות לשילוב: ${additionalKeywords || "ללא מילות מפתח נוספות"}
הנחיות מיוחדות מהלקוח: ${guidelines || "אין משהו מיוחד, כתוב מאמר מצוין"}${searchGuidance}

המאמר חייב לכלול:
1. כותרת מושכת קליקים ומותאמת SEO (עם מילת המפתח בתוכה)
2. כותרת מטא (SEO Title) פנימית באורך של עד 60 תווים
3. תיאור מטא (Meta Description) מניע לפעולה באורך של עד 155 תווים כולל מילת המפתח הראשית.
4. סלאג מומלץ (URL Slug) באנגלית (למשל seo-optimized-article-on-keyword).
5. ראשי פרקים מפורטים (ראשי תיבות של H2 ו-H3).
6. תוכן מאמר מלא (באורך 500-1000 מילים) כתוב בפורמט Markdown מלא כולל פסקאות, כותרות H1, H2, H3, רשימות (bullets), והדגשות (bold) למילים החשובות.
7. חלק של שאלות נפוצות (FAQ) קצר עם תשובות רשמיות לשיפור הסיכוי להופיע ב-Featured Snippets של גוגל.
8. טיפים משלימים לקידום הדף הספציפי הזה בגוגל.

החזר את כל הנתונים במבנה JSON הבא בדיוק (אל תפרט הערות נוספות מחוץ ל-JSON):
{
  "id": "מזהה ייחודי קצר שאתה מייצר",
  "keyword": "${keyword}",
  "title": "כותרת המאמר המרכזית (H1)",
  "metaTitle": "SEO Title מוערך",
  "metaDescription": "Meta Description מוערך ומאתגר",
  "urlSlug": "excellent-slug-example",
  "wordCount": 850, // מספר המילים המדויק במאמר שייצרת בפועל
  "outline": [
    { "sectionTitle": "פרק 1: שם הפרק", "description": "תמצית קצרה על מה מדובר בפרק" }
  ],
  "content": "המאמר המלא בפורמט Markdown כולל כותרות H2, H3, פסקאות, הדגשות, וזרימה טבעית בעברית...",
  "faqs": [
    { "question": "שאלה נפוצה ראשונה?", "answer": "תשובה קצרה ומדויקת" }
  ],
  "seoTips": ["טיפ ראשון לקדם את המאמר בגוגל", "טיפ שני לקישורים פנימיים"]
}

יש לכתוב את כל התכנים בעברית רהוטה ונקייה במיוחד, מוכנה לפרסום בבלוגים או אתרי חדשות גדולים. מובטח שתשלב את מילת המפתח הראשית בפסקה הראשונה וכמה פעמים נוספות במאמר באופן טבעי (בלי ספאמינג).`;

    const config: any = {
      systemInstruction: "You are an award-winning Hebrew copywriter and master SEO Content Architect. You generate articles that human readers love to read and Google loves to rank.",
      responseMimeType: "application/json"
    };

    if (useSearch) {
      config.tools = [{ googleSearch: {} }];
    }

    const response = await client.models.generateContent({
      model: "gemini-3.5-flash",
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
3. החזר אך ורק מבנה JSON תואם לחלוטין (אל תפרט הערות נוספות מחוץ ל-JSON):
{
  "id": "${article.id || "art_" + Date.now()}",
  "keyword": "${article.keyword}",
  "title": "הכותרת המעודכנת (או המקורית)",
  "metaTitle": "SEO Title מעודכן",
  "metaDescription": "Meta Description מעודכן",
  "urlSlug": "excellent-slug-example",
  "wordCount": 850, // אומדן מילים חדש
  "outline": [
    { "sectionTitle": "שם הפרק", "description": "תמצית קצרה" }
  ],
  "content": "התוכן המלא המעודכן בפורמט Markdown...",
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

// Serve static assets / handle Vite middleware
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

// On Vercel the Express app is exported (see api/index.ts) and invoked as a
// serverless function per-request -- it must NOT call app.listen() or try to
// serve dist/ itself (Vercel serves the static build output directly via
// "outputDirectory" in vercel.json). Everywhere else (local dev, "npm start"
// on a traditional Node host) we boot a normal long-running HTTP server.
if (!process.env.VERCEL) {
  startServer();
}

export default app;
