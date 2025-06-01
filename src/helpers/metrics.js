// stock-metrics.js
const yahooFinance = require('yahoo-finance2').default;
const express = require('express');

const end = new Date();
const start = new Date();
start.setFullYear(end.getFullYear() - 2);

// Utility: compute standard deviation of an array
function standardDeviation(arr) {
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const variance =
    arr.reduce((sum, x) => sum + (x - mean) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

// Compute metrics for a series of daily prices
function computeMetrics(prices) {
  let metrics = {};

  // Simple linear regression (price ~ time index)
  const n = prices.length;
  if (n < 2) return null; // not enough data

  const x = [...Array(n).keys()]; // [0,1,...]
  const y = prices;
  const xMean = (n - 1) / 2;
  const yMean = prices.reduce((a, b) => a + b, 0) / n;
  let num = 0,
    den = 0;
  for (let i = 0; i < n; i++) {
    num += (x[i] - xMean) * (y[i] - yMean);
    den += (x[i] - xMean) * (x[i] - xMean);
  }
  const slope = num / den; // price change per day
  const intercept = yMean - slope * xMean;
  // Compute R^2 (confidence in trend)
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

  // Sentiment
  metrics.sentiment =
    slope > 0 ? 'Positive' : slope < 0 ? 'Negative' : 'Neutral';

  // Estimated price change
  const currentPrice = prices[n - 1];
  const projectedChange = slope * (n - 1); // naive: same trend for next n days
  const estimatedPrice = currentPrice + projectedChange;
  metrics.estimatedChange = (estimatedPrice - currentPrice).toFixed(2);
  metrics.estimatedPercent =
    (((estimatedPrice - currentPrice) / currentPrice) * 100).toFixed(2) + '%';

  // Confidence (as %)
  metrics.confidence = confidence.toFixed(1) + '%';

  // Risk (volatility of daily returns, annualized)
  let returns = [];
  for (let i = 1; i < n; i++) {
    returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }
  const vol = standardDeviation(returns) * Math.sqrt(252) * 100; // %
  metrics.risk = vol.toFixed(2) + '%';

  // Recommendation label
  metrics.recommendation = getRecommendationLabel(
    metrics.sentiment,
    confidence / 100,
  );

  return metrics;
}

// Helper to get last N days of prices (approximate trading days)
function tail(arr, n) {
  return arr.slice(Math.max(arr.length - n, 0));
}

function getRecommendationLabel(sentiment, confidence) {
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

function hasSufficientData(history, minDays = 250) {
  return history && history.length >= minDays;
}

// Main function: fetch data and output metrics
export async function getMetrics(ticker) {
  // Define date range: past 12 months
  //   const end = new Date();
  //   const start = new Date();
  //   start.setFullYear(end.getFullYear() - 1);

  // Fetch historical daily prices for 1 year
  const historical = await yahooFinance.historical(ticker, {
    period1: start.toISOString().slice(0, 10),
    period2: end.toISOString().slice(0, 10),
    interval: '1d',
  });

  if (!historical || historical.length === 0) {
    console.error(`No data for ${ticker}`);
    return;
  }
  // Extract closing prices
  const closes = historical.map((day) => day.close).filter((p) => p != null);

  const data3m = tail(closes, 63); // ~3 months
  const data6m = tail(closes, 126); // ~6 months
  const data12m = tail(closes, 252); // ~12 months

  // Compute and print metrics for each horizon
  console.log(`Metrics for ${ticker}:`);
  if (data3m.length > 1) {
    const m3 = computeMetrics(data3m);
    console.log(
      `  3 Months -> Sentiment: ${m3.sentiment}, Confidence: ${m3.confidence}, ` +
        `Est Δ: ${m3.estimatedChange} (${m3.estimatedPercent}), Risk: ${m3.risk}`,
    );
  }
  if (data6m.length > 1) {
    const m6 = computeMetrics(data6m);
    console.log(
      `  6 Months -> Sentiment: ${m6.sentiment}, Confidence: ${m6.confidence}, ` +
        `Est Δ: ${m6.estimatedChange} (${m6.estimatedPercent}), Risk: ${m6.risk}`,
    );
  }
  if (data12m.length > 1) {
    const m12 = computeMetrics(data12m);
    console.log(
      ` 12 Months -> Sentiment: ${m12.sentiment}, Confidence: ${m12.confidence}, ` +
        `Est Δ: ${m12.estimatedChange} (${m12.estimatedPercent}), Risk: ${m12.risk}`,
    );
  }
}

// Example: run from command-line or integrate with Express
const tickerArg = process.argv[2];
if (tickerArg) {
  getMetrics(tickerArg.toUpperCase()).catch((err) => console.error(err));
} else {
  // (Optional) start Express server with an API endpoint
  const app = express();
  const PORT = 3003;
  app.get('/stock/:ticker', async (req, res) => {
    try {
      const hist = await yahooFinance.historical(req.params.ticker, {
        period1: start.toISOString().slice(0, 10),
        period2: end.toISOString().slice(0, 10),
        interval: '1d',
      });

      // print number of historical data points
      console.log(
        `Fetched ${hist.length} historical data points for ${req.params.ticker}`,
      );

      if (!hasSufficientData(hist)) {
        return res.status(400).json({
          error: `Not enough historical data available for ${req.params.ticker}. At least 1 year of daily data is required.`,
        });
      }

      const closes = hist.map((d) => d.close).filter((p) => p != null);
      const m3 = computeMetrics(tail(closes, 63));
      const m6 = computeMetrics(tail(closes, 126));
      const m12 = computeMetrics(tail(closes, 252));
      res.json({ '3m': m3, '6m': m6, '12m': m12 });
    } catch (err) {
      res.status(500).send(`Error: ${err}`);
    }
  });
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}
