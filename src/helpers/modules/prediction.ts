import yahooFinance from 'yahoo-finance2';
//import * as tf from '@tensorflow/tfjs-node';
import * as tf from '@tensorflow/tfjs';
import * as ti from 'technicalindicators';

const sectorMessages: Record<string, string[]> = {
  Technology: [
    'Tech stocks can be sensitive to interest rates and innovation cycles.',
    'The sector tends to outperform during periods of growth and strong earnings.',
  ],
  Financial: [
    'Financials are influenced by interest rate policy and economic outlook.',
    'Banking sector shows cyclical behavior tied to inflation and lending demand.',
  ],
  Healthcare: [
    'Healthcare offers defensive strength in uncertain economic periods.',
    'Innovation and FDA approvals can drive sharp upswings in this sector.',
  ],
  Energy: [
    'Energy stocks often mirror commodity price movements.',
    'Geopolitical tensions and demand cycles impact the energy sector.',
  ],
  Consumer: [
    'Consumer goods stocks are tied to consumer confidence and spending trends.',
    'Economic slowdowns can weaken retail and consumer discretionary spending.',
  ],
  Unknown: [
    'No specific sector insight available. General market trends may apply.',
  ],
};

const riskMessages: Record<string, string[]> = {
  Low: [
    'The historical volatility is low, suggesting more stable price action.',
    'Risk is contained, which can attract more conservative investors.',
  ],
  Medium: [
    'Moderate volatility implies a balance of opportunity and caution.',
    'The stock shows healthy price fluctuations without extreme swings.',
  ],
  High: [
    'High volatility may indicate potential for large gains or losses.',
    'Caution advised — price swings could be unpredictable.',
  ],
};

const confidenceMessages = [
  'The model shows high conviction in this prediction.',
  'Prediction confidence is moderate; market signals are mixed.',
  'Low confidence from the model — market conditions may be uncertain.',
];

const daysBack = 3 * 365;

const intervals = [
  { name: '3 Months', days: 63 },
  { name: '6 Months', days: 126 },
  { name: '12 Months', days: 252 },
];

interface PriceData {
  close: number;
  date: Date;
}

interface PredictionResult {
  interval: string;
  industry: string;
  sector?: string;
  sentiment: string;
  confidence: string;
  projectedChange: string;
  riskLevel: string;
  insights: string[];
  contextInsights: string[];
}

async function fetchStockData(symbol: string): Promise<PriceData[]> {
  const result = await yahooFinance.historical(symbol, {
    period1: new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000),
    interval: '1d',
  });

  return result
    .map((d: any) => ({
      close: d.adjClose,
      date: d.date,
    }))
    .filter((d: PriceData) => d.close != null);
}

function prepareData(prices: PriceData[], futureDays: number) {
  const features: number[][] = [];
  const labels: number[][] = [];
  const pctChanges: number[] = [];

  for (let i = 5; i < prices.length - futureDays; i++) {
    const pastChange =
      (prices[i].close - prices[i - 5].close) / prices[i - 5].close;
    const futureChange =
      (prices[i + futureDays].close - prices[i].close) / prices[i].close;

    features.push([pastChange]);
    pctChanges.push(futureChange);

    if (futureChange > 0.05) labels.push([1, 0, 0]);
    else if (futureChange < -0.05) labels.push([0, 1, 0]);
    else labels.push([0, 0, 1]);
  }

  return { features, labels, pctChanges };
}

async function trainModel(features: number[][], labels: number[][]) {
  const model = tf.sequential();
  model.add(
    tf.layers.dense({ units: 10, inputShape: [1], activation: 'relu' }),
  );
  model.add(tf.layers.dense({ units: 3, activation: 'softmax' }));

  model.compile({
    optimizer: 'adam',
    loss: 'categoricalCrossentropy',
    metrics: ['accuracy'],
  });

  const xs = tf.tensor2d(features);
  const ys = tf.tensor2d(labels);

  await model.fit(xs, ys, { epochs: 50, verbose: 0 });

  return model;
}

function calculateRiskLevel(stddev: number): string {
  const percent = stddev * 100;
  if (percent < 10) return 'Low';
  if (percent < 20) return 'Medium';
  return 'High';
}

function standardDeviation(values: number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(variance);
}

function getTechnicalIndicators(data: PriceData[]) {
  const closes = data.map((d) => d.close);
  const sma = ti.SMA.calculate({ period: 20, values: closes });
  const rsi = ti.RSI.calculate({ period: 14, values: closes });

  return {
    latestRSI: rsi[rsi.length - 1],
    latestSMA: sma[sma.length - 1],
    latestPrice: closes[closes.length - 1],
  };
}

function getInsightFromIndicators(
  rsi: number,
  price: number,
  sma: number,
): string[] {
  const insights: string[] = [];

  if (rsi < 30)
    insights.push('RSI indicates oversold conditions (potential buy).');
  else if (rsi > 70)
    insights.push('RSI indicates overbought conditions (potential sell).');
  else insights.push('RSI in neutral zone, no clear momentum.');

  if (price > sma) insights.push('Price is above 20-day SMA (bullish trend).');
  else if (price < sma)
    insights.push('Price is below 20-day SMA (bearish trend).');
  else insights.push('Price near 20-day SMA (neutral trend).');

  return insights;
}

function mapSentiment(index: number, confidence: number): string {
  const confPercent = confidence * 100;

  if (index === 0) {
    if (confPercent >= 95) return 'Very Strong Buy';
    else if (confPercent >= 85) return 'Strong Buy';
    else if (confPercent >= 70) return 'Buy';
    else return 'Neutral';
  } else if (index === 1) {
    if (confPercent >= 85) return 'Strong Sell';
    else return 'Weak Sell';
  } else {
    return 'Neutral';
  }
}

function generateContextualInsights({
  sector,
  risk,
  confidence,
  sentiment,
  projectedChange,
}: {
  sector: string;
  risk: string;
  confidence: number;
  sentiment: string;
  projectedChange: number;
}): string[] {
  const insights: string[] = [];

  // Sector insight
  const sectorInsight = sectorMessages[sector] || sectorMessages['Unknown'];
  insights.push(
    sectorInsight[Math.floor(Math.random() * sectorInsight.length)],
  );

  // Risk insight
  const riskInsight = riskMessages[risk] || riskMessages['Medium'];
  insights.push(riskInsight[Math.floor(Math.random() * riskInsight.length)]);

  // Confidence insight
  if (confidence > 85) insights.push(confidenceMessages[0]);
  else if (confidence > 65) insights.push(confidenceMessages[1]);
  else insights.push(confidenceMessages[2]);

  // Projection insight
  if (projectedChange > 10)
    insights.push('The model anticipates strong upward momentum.');
  else if (projectedChange < -10)
    insights.push('The model anticipates strong downward momentum.');

  // Sentiment insight
  if (sentiment.includes('Buy'))
    insights.push(
      'Buying may be justified based on recent momentum and technicals.',
    );
  if (sentiment.includes('Sell'))
    insights.push(
      'Selling is suggested due to weakening indicators or overvaluation.',
    );
  if (sentiment === 'Neutral')
    insights.push(
      'The market may be awaiting a catalyst — holding could be wise.',
    );

  return insights;
}

async function fetchSectorInfo(symbol: string) {
  try {
    const profile = await yahooFinance.quoteSummary(symbol, {
      modules: ['assetProfile'],
    });
    const sector = profile.assetProfile?.sector || 'Unknown';
    const industry = profile.assetProfile?.industry || 'Unknown';
    return { sector, industry };
  } catch (err) {
    console.error('Failed to fetch sector info:', err.message);
    return { sector: 'Unknown', industry: 'Unknown' };
  }
}

export async function predict(symbol: string): Promise<PredictionResult[]> {
  const pricesData = await fetchStockData(symbol);
  const { sector, industry } = await fetchSectorInfo(symbol);
  const results: PredictionResult[] = [];

  for (const interval of intervals) {
    const { features, labels, pctChanges } = prepareData(
      pricesData,
      interval.days,
    );
    if (features.length === 0 || labels.length === 0 || pctChanges.length === 0)
      continue;
    const model = await trainModel(features, labels);
    const latestFeature = features[features.length - 1];
    const futurePctChange = pctChanges[pctChanges.length - 1];

    const prediction = model.predict(tf.tensor2d([latestFeature])) as tf.Tensor;
    const result = (await prediction.array()) as number[][];
    const resultArr = result[0];
    const maxIdx = resultArr.indexOf(Math.max(...resultArr));
    const sentiment = mapSentiment(maxIdx, resultArr[maxIdx]);
    const confidence = (resultArr[maxIdx] * 100).toFixed(2);
    const projectedChange = (futurePctChange * 100).toFixed(2);

    const stddev = standardDeviation(pctChanges);
    const riskLevel = calculateRiskLevel(stddev);

    const indicators = getTechnicalIndicators(pricesData);
    const explanationList = getInsightFromIndicators(
      indicators.latestRSI,
      indicators.latestPrice,
      indicators.latestSMA,
    );
    const contextInsights = generateContextualInsights({
      sector,
      risk: riskLevel,
      confidence: resultArr[maxIdx] * 100,
      sentiment,
      projectedChange: futurePctChange * 100,
    });

    results.push({
      interval: interval.name,
      sector,
      industry,
      sentiment,
      confidence,
      projectedChange,
      riskLevel,
      insights: explanationList,
      contextInsights: contextInsights,
    });
  }

  return results;
}
