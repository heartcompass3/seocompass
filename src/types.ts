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

export interface YourSiteAnalysis {
  name: string;
  websiteUrl: string;
  domainAuthority: number;
  estimatedTraffic: string;
  rankingOverview: string;
  strengths: string[];
  opportunities: string[];
  actionPlan: string;
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

export type ContentDomain = 'parents' | 'youth' | 'personal' | 'relationships';
export type ContentRole = 'supporting' | 'pillar' | 'money';

export interface AcademicSource {
  title: string;
  authors?: string;
  year?: string;
  publisher?: string;
  url?: string;
  note?: string;
  sourceType?: 'academic' | 'book' | 'clinical';
}

export interface ArticleCTA {
  heading: string;
  text: string;
  buttonLabel: string;
  buttonHref: string;
}

export interface InsightPlacement {
  domain: ContentDomain;
  category: string;
  secondary?: Array<{ domain: ContentDomain; category: string }>;
}

export interface GeneratedArticle {
  id: string;
  keyword: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  urlSlug: string;
  slug?: string;
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
  // These are produced so each Sanity field can be copied manually 1:1 or pushed via API.
  goldLine?: string;    // Sanity: goldLine  — שורת מסגור (זהב) / תת-כותרת המנגנון
  excerpt?: string;     // Sanity: excerpt   — תקציר ענייני (יושב ב-meta description ובכרטיס)
  tags?: SanityArticleTag[]; // Sanity: tags  — תחומים, מהרשימה הסגורה בלבד
  authorLine?: string;  // Sanity: authorLine — שורת סמכות ("יוסי מדלסי · מומחה לשחרור דפוסים")
  imageAlt?: string;    // Sanity: mainImage.alt — טקסט חלופי לתמונה הראשית
  aiCitation?: string;  // משפט הגדרה עצמאי שמנוע AI יכול לחלץ (GEO/AEO)
  bodyHtml?: string;    // גוף המאמר כ-HTML RTL מוכן להדבקה לעורך של Sanity

  // --- Extended 2026 GEO & Sanity Growth Fields ---
  domain?: ContentDomain;
  contentRole?: ContentRole;
  searchIntent?: SearchIntentType;
  painTags?: string[];
  disambiguatingDescription?: string;
  keyTakeaways?: {
    heading: string;
    items: string[];
  };
  insightPlacement?: InsightPlacement;
  aiContext?: string;
  searchPhrases?: string[];
  relatedToMethod?: boolean;
  sources?: AcademicSource[];
  cta?: ArticleCTA;
  jsonLdSchema?: Record<string, any>; // Generated Schema.org (Article, FAQ, Person)

  // Anti-Cannibalization Guard automatic audit result
  cannibalizationGuard?: {
    checked: boolean;
    articlesChecked: number;
    overlapDetected: boolean;
    overlapScore: number;
    conflictingArticles?: Array<{
      title: string;
      slug: string;
      goldLine?: string;
      similarityScore: number;
      reason?: string;
    }>;
    recommendation: string;
  };

  // Status flags
  pushedToSanity?: boolean;
  sanityDraftId?: string;
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

export interface ReelsBeat {
  timecode: string;     // e.g. "0-3s"
  onScreenText: string;
  voiceover: string;
  visual: string;
}

export interface ReelsScript {
  hook: string;
  beats: ReelsBeat[];
  caption: string;
  hashtags: string[];
  audioIdea: string;
  cta: string;
}

export interface GeneratedSocialPosts {
  sourceTitle: string;
  sourceUrl?: string;
  posts: SocialPost[];          // caption posts (instagram/facebook)
  carousel: CarouselSlide[];    // optional IG carousel outline (may be empty)
  reels?: ReelsScript | null;   // optional Reels script when reels requested
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

// =======================
// Cannibalization Guard & 360 Campaign types
// =======================

export interface CannibalizationMatch {
  title: string;
  slug: string;
  goldLine?: string;
  similarityScore: number;
  reason: string;
}

export interface CannibalizationCheckResult {
  hasRisk: boolean;
  score: number;
  matchedArticles: CannibalizationMatch[];
  suggestedFocusAngles: string[];
  recommendation: string;
}

export interface CampaignNewsletter {
  subjectLines: string[];
  previewText: string;
  openingScene: string;
  body: string;
  callToAction: string;
}

export interface SuggestedToolMatch {
  title: string;
  path: string;
  reason: string;
}

export interface Campaign360 {
  articleId: string;
  articleTitle: string;
  articleSlug: string;
  suggestedTool: SuggestedToolMatch;
  newsletter: CampaignNewsletter;
  socialPosts: SocialPost[];
  carousel: CarouselSlide[];
  reels: ReelsScript;
}
