export interface YahooQuote {
  ask?: number;
  askSize?: number;
  bid?: number;
  bidSize?: number;
  corporateActions?: any[];
  cryptoTradeable?: boolean;
  currency?: string;
  customPriceAlertConfidence?: string;
  esgPopulated?: boolean;
  exchange?: string;
  exchangeDataDelayedBy?: number;
  exchangeTimezoneName?: string;
  exchangeTimezoneShortName?: string;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekHighChange?: number;
  fiftyTwoWeekHighChangePercent?: number;
  fiftyTwoWeekLow?: number;
  fiftyTwoWeekLowChange?: number;
  fiftyTwoWeekLowChangePercent?: number;
  fiftyTwoWeekRange?: FiftyTwoWeekRange;
  fullExchangeName?: string;
  gmtOffSetMilliseconds?: number;
  hasPrePostMarketData?: boolean;
  language?: string;
  longName?: string;
  market?: string;
  marketCap?: number;
  marketState?: string;
  priceHint?: number;
  quoteSourceName?: string;
  quoteType?: string;
  region?: string;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  regularMarketDayRange?: RegularMarketDayRange;
  regularMarketOpen?: number;
  regularMarketPreviousClose?: number;
  regularMarketPrice?: number;
  regularMarketTime?: string;
  regularMarketVolume?: number;
  shortName?: string;
  sourceInterval?: number;
  symbol?: string;
  tradeable?: boolean;
  triggerable?: boolean;
}

export interface RegularMarketDayRange {
  low: number;
  high: number;
}

export interface FiftyTwoWeekRange {
  low: number;
  high: number;
}
