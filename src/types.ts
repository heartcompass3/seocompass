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

// =======================
// Social suite types
// =======================

export type SocialPlatform = 'instagram' | 'facebook';

// Lightweight article reference used to populate the post-generator picker.
export interface SocialArticleRef {
  title: string;
  slug: string;
  excerpt?: string;
  tags?: string[];
}

export interface SocialPost {
  platform: SocialPlatform;
  hookVariations: string[]; // 2-3 opening-line options for A/B
  caption: string;          // full caption in brand voice
  hashtags: string[];
  cta: string;
  visualIdea: string;       // suggested image/visual direction
}

export interface CarouselSlide {
  slideTitle: string;
  slideText: string;
}

export interface GeneratedSocialPosts {
  sourceTitle: string;
  sourceUrl?: string;
  posts: SocialPost[];        // one per requested platform
  carousel: CarouselSlide[];  // optional IG carousel outline (may be empty)
}

// --- Hashtag & topic research ---
export interface HashtagItem {
  tag: string;
  size: 'broad' | 'niche' | 'branded';
  estReach: string; // e.g. "1M+ posts" / "אלפי פוסטים"
}

export interface ContentAngle {
  angle: string;
  hook: string;
}

export interface SocialResearch {
  topic: string;
  platform: SocialPlatform;
  hashtags: HashtagItem[];
  angles: ContentAngle[];
  bestTimes: string[];      // suggested posting windows
  contentPillars: string[]; // recurring content themes
}

// --- Competitor social analysis (estimated via AI) ---
export interface SocialCompetitor {
  name: string;
  handle: string;
  platform: string;          // "אינסטגרם" / "פייסבוק" / "טיקטוק"
  estFollowers: string;
  contentStyle: string;
  postingFrequency: string;
  strengths: string[];
  gaps: string[];            // opportunities for you
  winningFormats: string[];  // formats that perform for them
}

// --- Social strategy chat ---
export interface SocialChatMessage {
  role: 'user' | 'model';
  message: string;
}
