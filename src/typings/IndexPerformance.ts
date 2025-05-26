export interface PeriodPerformance {
  change: number;
  changePercent: number;
}

export interface PerformanceDetails {
  fiveDay: PeriodPerformance;
  oneMonth: PeriodPerformance;
  threeMonths: PeriodPerformance;
  sixMonths: PeriodPerformance;
  oneYear: PeriodPerformance;
}

export interface IndexPerformance {
  symbol: string;
  performance: PerformanceDetails;
}
