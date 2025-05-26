const sectorMessages = {
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

const riskMessages = {
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

const yahooFinance = require('yahoo-finance2').default;
//const tf = require("@tensorflow/tfjs");
const tf = require('@tensorflow/tfjs-node');
const ti = require('technicalindicators');

const daysBack = 3 * 365;

const intervals = [
  { name: '3 Months', days: 63 },
  { name: '6 Months', days: 126 },
  { name: '12 Months', days: 252 },
];

async function fetchStockData(symbol) {
  const result = await yahooFinance.historical(symbol, {
    period1: new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000),
    interval: '1d',
  });

  return result
    .map((d) => ({
      close: d.adjClose,
      date: d.date,
    }))
    .filter((d) => d.close != null);
}

function prepareData(prices, futureDays) {
  const features = [];
  const labels = [];
  const pctChanges = [];

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

async function trainModel(features, labels) {
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

function calculateRiskLevel(stddev) {
  const percent = stddev * 100;
  if (percent < 10) return 'Low';
  if (percent < 20) return 'Medium';
  return 'High';
}

function standardDeviation(values) {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(variance);
}

function getTechnicalIndicators(data) {
  const closes = data.map((d) => d.close);
  const sma = ti.SMA.calculate({ period: 20, values: closes });
  const rsi = ti.RSI.calculate({ period: 14, values: closes });

  return {
    latestRSI: rsi[rsi.length - 1],
    latestSMA: sma[sma.length - 1],
    latestPrice: closes[closes.length - 1],
  };
}

function getInsightFromIndicators(rsi, price, sma) {
  const insights = [];

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

function mapSentiment(index, confidence) {
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
}) {
  const insights = [];

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
    insights.push('Expecting notable downside risk.');
  else if (projectedChange > 3)
    insights.push('Mild positive momentum detected.');
  else if (projectedChange < -3)
    insights.push('Price weakening trend may continue.');
  else
    insights.push('Projected price change is marginal — sentiment may shift.');

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

export async function predict(symbol) {
  const pricesData = await fetchStockData(symbol);
  const closes = pricesData.map((p) => p.close);

  console.log(`\n📈 Predictions for ${symbol}:\n`);

  for (const interval of intervals) {
    const { features, labels, pctChanges } = prepareData(
      pricesData,
      interval.days,
    );
    const model = await trainModel(features, labels);
    const latestFeature = features[features.length - 1];
    const futurePctChange = pctChanges[pctChanges.length - 1];

    const prediction = model.predict(tf.tensor2d([latestFeature]));
    const result = prediction.arraySync()[0];
    const maxIdx = result.indexOf(Math.max(...result));
    // const sentiment = ['Buy', 'Sell', 'Hold'][maxIdx];
    const sentiment = mapSentiment(maxIdx, result[maxIdx]);

    const confidence = (result[maxIdx] * 100).toFixed(2);
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
      confidence: result[maxIdx] * 100,
      sentiment,
      projectedChange: futurePctChange * 100,
    });

    // log contextual insights
    console.log(`🔍 Contextual Insights for ${symbol} (${interval.name}):`);

    console.log(`🕒 ${interval.name}:`);
    console.log(`   → Sentiment: ${sentiment}`);
    console.log(`   → Confidence: ${confidence}%`);
    console.log(`   → Est. % Price Change: ${projectedChange}%`);
    console.log(`   → Risk Level: ${riskLevel}`);
    explanationList.forEach((e) => console.log(`   → Insight: ${e}`));
    contextInsights.forEach((i) => console.log(`   → Context: ${i}`));
    console.log();
  }
}

// predict(symbol);
