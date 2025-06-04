export interface Stock {
  symbol: string;
  name?: { label: string };
  change: number;
  changePercent: string;
  last: number;
  changeDirection: string;
  [key: string]: any;
}
