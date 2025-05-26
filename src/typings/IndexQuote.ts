export interface IndexQuote {
  symbol: string;
  quote: {
    language: string;
    region: string;
    quoteType: string;
    typeDisp: string;
    quoteSourceName: string;
    triggerable: boolean;
    customPriceAlertConfidence: string;
    longName: string;
    averageDailyVolume10Day: number;
    marketState: string;
    regularMarketChangePercent: number;
    regularMarketPrice: number;
    regularMarketTime: string; // ISO date string
    exchange: string;
    exchangeTimezoneName: string;
    exchangeTimezoneShortName: string;
    gmtOffSetMilliseconds: number;
    market: string;
    esgPopulated: boolean;
    sourceInterval: number;
    exchangeDataDelayedBy: number;
    tradeable: boolean;
    cryptoTradeable: boolean;
    hasPrePostMarketData: boolean;
    firstTradeDateMilliseconds: string; // ISO date string
    priceHint: number;
    regularMarketPreviousClose: number;
    fullExchangeName: string;
    symbol: string;
    error?: string;
  };
}
