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
