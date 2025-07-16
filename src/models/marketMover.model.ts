export interface MarketMoverModel {
  symbol: string;
  index: string;
  json?: string;
  name: string;
  price: number;
  priceChange: number;
  priceChangePercent: number;
}
