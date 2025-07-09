export interface ReutersNews {
  statusCode: number;
  message: string;
  result: Result;
  _id: string;
}

export interface Result {
  marketInfo: MarketInfo;
  pagination: Pagination;
  date_modified: string;
  articles: Article[];
  response_time: number;
}

export interface MarketInfo {
  ric: string;
  original_ric: string;
  name: string;
  ricType: string;
  last: number;
  exchange: string;
}

export interface Pagination {
  size: number;
  expected_size: number;
  total_size: number;
  orderby: string;
}

export interface NewsItem {
  imageUrl: string;
  url: string;
  title: string;
  date: number;
}

export interface Article {
  id: string;
  canonical_url: string;
  website: string;
  web: string;
  native: string;
  updated_time: string;
  published_time: string;
  article_type: string;
  display_my_news: boolean;
  display_newsletter_signup: boolean;
  display_notifications: boolean;
  display_related_media: boolean;
  display_related_organizations: boolean;
  content_code: string;
  source: Source;
  company_rics: string;
  title: string;
  basic_headline: string;
  distributor: string;
  description: string;
  primary_media_type: string;
  primary_tag: PrimaryTag;
  word_count: number;
  read_minutes: number;
  kicker: Kicker;
  ad_topics: string[];
  thumbnail: Thumbnail;
  authors: Author[];
  display_time: string;
}

export interface Source {
  name: string;
  original_name: string;
}

export interface PrimaryTag {
  short_bio: string;
  description: string;
  slug: string;
  text: string;
  topic_url: string;
}

export interface Kicker {
  path: string;
  names: string[];
}

export interface Thumbnail {
  url: string;
  caption: string;
  type: string;
  resizer_url: string;
  location: string;
  id: string;
  authors: string;
  alt_text: string;
  width: number;
  height: number;
  subtitle: string;
  slug: string;
  updated_at: string;
  company: string;
  purchase_licensing_path: string;
}

export interface Author {
  id: string;
  name: string;
  first_name: string;
  last_name: string;
  company: string;
  thumbnail: Thumbnail2;
  social_links: SocialLink[];
  byline: string;
  topic_url: string;
}

export interface Thumbnail2 {
  url: string;
  type: string;
  resizer_url: string;
}

export interface SocialLink {
  site: string;
  url: string;
}
