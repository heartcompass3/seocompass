export interface CompetitorAnalysis {
  competitorName: string;
  websiteUrl: string;
  domainAuthority: number; // 1-100
  estimatedTraffic: string; // e.g., "50K/month"
  trafficShare: number; // percentage
  mainKeywords: string[];
  strengths: string[];
  weaknesses: string[];
  backlinkProfile: {
    strength: 'High' | 'Medium' | 'Low';
    estimatedCount: number;
    anchorTextStrategy: string;
  };
  onPageSEOStatus: {
    score: number; // 1-100
    mobileFriendly: boolean;
    pageSpeed: 'Fast' | 'Average' | 'Slow';
    missingMetaTags: string[];
  };
  contentStrategy: string;
}

export type SearchIntentType = 'Informational' | 'Transactional' | 'Navigational' | 'Commercial';

export interface KeywordResearchResult {
  keyword: string;
  searchVolume: number;
  difficulty: number; // 0-100
  cpc: number; // cost per click in USD or local
  intent: SearchIntentType;
  kei: number; // Keyword Effectiveness Index
  seoValue: 'High' | 'Medium' | 'Low';
  relevanceToTopic: number; // 1-10
  suggestedAction: string;
}

// Closed list of allowed tags ("תחומים") as defined in the Sanity `article` schema.
// The article generator MUST pick from this list only.
export const SANITY_ARTICLE_TAGS = [
  'זוגיות',
  'הורות',
  'נוער',
  'קריירה',
  'התפתחות אישית',
] as const;

export type SanityArticleTag = typeof SANITY_ARTICLE_TAGS[number];

export interface GeneratedArticle {
  id: string;
  keyword: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  urlSlug: string;
  wordCount: number;
  outline: {
    sectionTitle: string;
    description: string;
  }[];
  content: string; // Markdown text
  faqs: {
    question: string;
    answer: string;
  }[];
  seoTips: string[];

  // --- Fields aligned with the Sanity `article` document schema ---
  // These are produced so each Sanity field can be copied manually 1:1.
  // Optional so older articles loaded from Drive/Firestore still type-check.
  goldLine?: string;    // Sanity: goldLine  — שורת מסגור (זהב) / תת-כותרת המנגנון
  excerpt?: string;     // Sanity: excerpt   — תקציר ענייני (יושב ב-meta description ובכרטיס)
  tags?: SanityArticleTag[]; // Sanity: tags  — תחומים, מהרשימה הסגורה בלבד
  authorLine?: string;  // Sanity: authorLine — שורת סמכות
  imageAlt?: string;    // Sanity: mainImage.alt — טקסט חלופי לתמונה הראשית
  aiCitation?: string;  // משפט הגדרה עצמאי שמנוע AI יכול לחלץ (GEO/AEO)
  bodyHtml?: string;    // גוף המאמר כ-HTML RTL מוכן להדבקה לעורך של Sanity

  savedDriveFileId?: string;
  savedDriveFileUrl?: string;
}

export interface SEORecommendation {
  id: string;
  category: 'On-Page' | 'Technical' | 'Content' | 'Off-Page';
  title: string;
  description: string;
  impact: 'High' | 'Medium' | 'Low';
  difficulty: 'High' | 'Medium' | 'Low';
  actionSteps: string[];
}
