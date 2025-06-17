export interface ChangeAndChangePercent {
  change: number | undefined;
  changePercent: number | undefined;
}

export interface Performance {
  oneDay: ChangeAndChangePercent | undefined;
  fiveDays: ChangeAndChangePercent | undefined;
  oneMonth: ChangeAndChangePercent | undefined;
  threeMonths: ChangeAndChangePercent | undefined;
  sixMonths: ChangeAndChangePercent | undefined;
  oneYear: ChangeAndChangePercent | undefined;
  threeYears: ChangeAndChangePercent | undefined;
  fiveYears: ChangeAndChangePercent | undefined;
  yearToDate: ChangeAndChangePercent | undefined;
}

export interface SymbolPerformance {
  symbol: string;
  performance: Performance;
}
