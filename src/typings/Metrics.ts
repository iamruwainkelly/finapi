export interface Metrics {
  threeMonths: Metric;
  sixMonths: Metric;
  twelveMonths: Metric;
}

export interface Metric {
  sentiment: string;
  estimatedChange: number;
  estimatedPercent: number;
  confidence: number;
  risk: number;
  recommendation: string;
}

export interface ThreeMonths {
  sentiment: string;
  estimatedChange: number;
  estimatedPercent: number;
  confidence: number;
  risk: number;
  recommendation: string;
}

export interface SixMonths {
  sentiment: string;
  estimatedChange: string;
  estimatedPercent: string;
  confidence: string;
  risk: string;
  recommendation: string;
}

export interface TwelveMonths {
  sentiment: string;
  estimatedChange: string;
  estimatedPercent: string;
  confidence: string;
  risk: string;
  recommendation: string;
}
