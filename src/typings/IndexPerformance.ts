export interface ChangeAndChangePercent {
  change: number | undefined;
  changePercent: number | undefined;
}

export interface PerformanceTimeFrames {
  d1: ChangeAndChangePercent | undefined;
  d5: ChangeAndChangePercent | undefined;
  m1: ChangeAndChangePercent | undefined;
  m3: ChangeAndChangePercent | undefined;
  m6: ChangeAndChangePercent | undefined;
  y1: ChangeAndChangePercent | undefined;
  y3: ChangeAndChangePercent | undefined;
  y5: ChangeAndChangePercent | undefined;
  ytd: ChangeAndChangePercent | undefined;
}

export interface SymbolPerformance {
  symbol: string;
  performance: PerformanceTimeFrames;
}
