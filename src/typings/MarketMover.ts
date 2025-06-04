export interface MarketMover {
  symbol: string;
  name?: string;
  volume?: number;
  avgVolume?: number;
  change?: number;
  changeDirection?: string;
  changePercent: string;
  price: number;
  [key: string]: any;
}
