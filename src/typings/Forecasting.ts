export interface ForecastPeriods {
  m3: Forecast;
  m6: Forecast;
  m12: Forecast;
}

export interface Forecast {
  sentiment: string;
  estimatedChange: number;
  estimatedPercent: number;
  confidence: number;
  risk: number;
  recommendation: string;
}
