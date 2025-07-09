import { HistoryModule } from './history';
import { ForecastPeriods } from '../../typings/Forecasting';

// Utility: compute standard deviation of an array
function standardDeviation(arr: number[]): number {
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const variance =
    arr.reduce((sum, x) => sum + (x - mean) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

// Compute metrics for a series of daily prices
export function computeMetrics(prices: number[]) {
  let metrics: any = {};
  const n = prices.length;
  if (n < 2) return null;
  const x = [...Array(n).keys()];
  const y = prices;
  const xMean = (n - 1) / 2;
  const yMean = prices.reduce((a, b) => a + b, 0) / n;
  let num = 0,
    den = 0;
  for (let i = 0; i < n; i++) {
    num += (x[i] - xMean) * (y[i] - yMean);
    den += (x[i] - xMean) * (x[i] - xMean);
  }
  const slope = num / den;
  const intercept = yMean - slope * xMean;
  let ssTot = 0,
    ssRes = 0;
  for (let i = 0; i < n; i++) {
    const yi = yMean;
    const yPred = slope * x[i] + intercept;
    ssTot += (y[i] - yi) * (y[i] - yi);
    ssRes += (y[i] - yPred) * (y[i] - yPred);
  }
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
  const confidence = Math.min(100, Math.max(0, r2 * 100));
  metrics.sentiment =
    slope > 0 ? 'Positive' : slope < 0 ? 'Negative' : 'Neutral';
  const currentPrice = prices[n - 1];
  const projectedChange = slope * (n - 1);
  const estimatedPrice = currentPrice + projectedChange;

  // 01 June 2025
  // Commented out. Use value as a number without the '%' sign
  //metrics.estimatedChange = (estimatedPrice - currentPrice).toFixed(2);
  metrics.estimatedChange = estimatedPrice - currentPrice;

  metrics.estimatedPercent =
    // 01 June 2025
    // Commented out. Use value as a number without the '%' sign
    // (((estimatedPrice - currentPrice) / currentPrice) * 100).toFixed(2) + '%';
    ((estimatedPrice - currentPrice) / currentPrice) * 100;

  // 01 June 2025
  // Commented out. Use value as a number without the '%' sign
  // metrics.confidence = confidence.toFixed(1) + '%';
  metrics.confidence = confidence;

  let returns: number[] = [];
  for (let i = 1; i < n; i++) {
    returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }
  const vol = standardDeviation(returns) * Math.sqrt(252) * 100;

  // 01 June 2025
  // Commented out. Use value as a number without the '%' sign
  // metrics.risk = vol.toFixed(2) + '%';
  metrics.risk = vol;

  metrics.recommendation = getRecommendationLabel(
    metrics.sentiment,
    confidence / 100,
  );
  return metrics;
}

function tail<T>(arr: T[], n: number): T[] {
  return arr.slice(Math.max(arr.length - n, 0));
}

function getRecommendationLabel(sentiment: string, confidence: number): string {
  if (sentiment === 'Positive') {
    if (confidence >= 0.8) return 'Strong Buy';
    if (confidence >= 0.6) return 'Buy';
    return 'Hold';
  } else if (sentiment === 'Negative') {
    if (confidence >= 0.8) return 'Strong Sell';
    if (confidence >= 0.6) return 'Sell';
    return 'Hold';
  }
  return 'Hold';
}

export async function getForecast(ticker: string): Promise<ForecastPeriods> {
  // history module ts
  const historyModule = new HistoryModule();
  const history = await historyModule.history(ticker);

  const closes = history
    .map((day: any) => day.close)
    .filter((p: number) => p != null);
  const data3m = tail(closes, 63);
  const data6m = tail(closes, 126);
  const data12m = tail(closes, 252);

  // Helper to clamp confidence to 69
  function clampConfidence(metric: any) {
    if (
      metric &&
      typeof metric.confidence === 'number' &&
      metric.confidence > 69
    ) {
      metric.confidence = 69;
    }
    return metric;
  }

  return {
    m3: data3m.length > 1 ? clampConfidence(computeMetrics(data3m)) : null,
    m6: data6m.length > 1 ? clampConfidence(computeMetrics(data6m)) : null,
    m12: data12m.length > 1 ? clampConfidence(computeMetrics(data12m)) : null,
  };
}
