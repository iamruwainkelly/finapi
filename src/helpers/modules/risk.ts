import * as ss from 'simple-statistics';
import { mean, std } from 'mathjs';
import yahooFinance from 'yahoo-finance2';
import { HistoryModule } from './history';
import { History } from '../../entities/history.entity';

interface FactorValue {
  name: string;
  value: number;
}

interface AnalyzeStockResult {
  contributions: FactorValue[];
  exposures: FactorValue[];
  contribution_percent: Record<string, number>;
  exposure_percent: Record<string, number>;
}

const historyModule = new HistoryModule();

const getReturns = (prices: any[]): number[] => {
  const returns = [];
  for (let i = 1; i < prices.length; i++) {
    const ret = (prices[i] - prices[i - 1]) / prices[i - 1];
    returns.push(ret);
  }
  return returns;
};

const getMomentumExposure = (history: History[]) => {
  if (history.length < 252 + 21) {
    throw new Error('Not enough data to calculate momentum exposure.');
  }

  history.sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );
  const price_252 = history[history.length - 252].close as number;
  const price_21 = history[history.length - 21].close as number;

  const momentumExposure = (price_21 - price_252) / price_252;

  return momentumExposure;
};

const analysis = async (index: string, stock: string): Promise<any> => {
  const indexHistory = await historyModule.history(index);
  const stockHistory = await historyModule.history(stock);

  const marketPrices = indexHistory.map((d) => d.close);
  const stockPrices = stockHistory.map((d) => d.close);

  const stockReturns = getReturns(stockPrices);
  const marketReturns = getReturns(marketPrices);

  // Align return series
  const minLength = Math.min(stockReturns.length, marketReturns.length);
  const alignedStockReturns = stockReturns.slice(0, minLength);
  const alignedMarketReturns = marketReturns.slice(0, minLength);

  // MARKET: beta via linear regression
  const beta_market =
    ss.linearRegressionLine(
      ss.linearRegression(
        alignedMarketReturns.map((x, i) => [x, alignedStockReturns[i]]),
      ),
    )(1) - ss.linearRegressionLine(ss.linearRegression([[0, 0]]))(1); // Slope only

  const avg_market_return = mean(alignedMarketReturns);
  const contribution_market = beta_market * avg_market_return;

  const momentum = getMomentumExposure(stockHistory);

  // VOLATILITY: inverse of standard deviation
  const volatility: any = std(alignedStockReturns);
  const vol_factor_exposure = 1 / volatility;
  const avg_vol_factor_return = 1 / std(alignedMarketReturns as any);
  const contribution_volatility = vol_factor_exposure * avg_vol_factor_return;

  // FUNDAMENTALS
  const summary = await yahooFinance.quoteSummary(stock, {
    modules: [
      'defaultKeyStatistics',
      'financialData',
      'summaryDetail',
      'price',
    ],
  });
  const info = summary.defaultKeyStatistics;

  if (!info) {
    throw new Error(`No financial data found for ${stock}`);
  }

  const pb = info.priceToBook || 10;
  const roe = summary.financialData?.returnOnEquity || 0.2;
  // Try to get marketCap from summaryDetail, then price, fallback to 1e12
  const marketCap =
    summary.summaryDetail?.marketCap || summary.price?.marketCap || 1e12;

  const value_exposure = 1 / pb;
  const quality_exposure = roe;
  const size_exposure = -Math.log(Number(marketCap) / 1e11);

  const contribution_value = value_exposure * 0.01;
  const contribution_quality = quality_exposure * 0.01;
  const contribution_size = size_exposure * 0.01;
  const contribution_momentum = momentum * 0.01;

  type FactorKey =
    | 'Market'
    | 'Size'
    | 'Value'
    | 'Momentum'
    | 'Quality'
    | 'Volatility';

  const contributions: FactorValue[] = [
    { name: 'Market', value: contribution_market },
    { name: 'Size', value: contribution_size },
    { name: 'Value', value: contribution_value },
    { name: 'Momentum', value: contribution_momentum },
    { name: 'Quality', value: contribution_quality },
    { name: 'Volatility', value: contribution_volatility },
  ];
  const exposures: FactorValue[] = [
    { name: 'Market', value: beta_market },
    { name: 'Size', value: size_exposure },
    { name: 'Value', value: value_exposure },
    { name: 'Momentum', value: momentum },
    { name: 'Quality', value: quality_exposure },
    { name: 'Volatility', value: vol_factor_exposure },
  ];

  // Convert contributions and exposures to Record for easier percentage calculation
  const total = Object.values(contributions).reduce(
    (sum, val) => sum + Math.abs(val.value),
    0,
  );

  // Calculate contribution percentages
  const contribution_percent: Record<FactorKey, number> = Object.fromEntries(
    Object.entries(contributions).map(([k, v]) => [
      k,
      (100 * Math.abs(v.value)) / total,
    ]),
  ) as Record<FactorKey, number>;

  // Calculate exposure percentages
  const exposure_total = Object.values(exposures).reduce(
    (sum, val) => sum + Math.abs(val.value),
    0,
  );
  const exposure_percent: Record<FactorKey, number> = Object.fromEntries(
    Object.entries(exposures).map(([k, v]) => [
      k,
      (100 * Math.abs(v.value)) / exposure_total,
    ]),
  ) as Record<FactorKey, number>;

  // Return an object with the analysis results
  return {
    exposures,
    contributions,
    contribution_percent,
    exposure_percent,
  };
};

/**
 * Calculate risk metrics for a series of returns.
 * @param returns Array of portfolio/asset returns
 * @param benchmarkReturns Optional: Array of benchmark returns for correlation
 */
export function metrics(
  returns: number[],
  benchmarkReturns?: number[],
): {
  correlation: number | null;
  valueAtRisk: number;
  expectedShortFall: number;
  maxDrawDown: number;
} {
  // Correlation
  let correlation: number | null = null;
  if (benchmarkReturns && benchmarkReturns.length === returns.length) {
    correlation = ss.sampleCorrelation(returns, benchmarkReturns);
  }

  // Value at Risk (VaR) at 95% confidence (historical method)
  const sorted = [...returns].sort((a, b) => a - b);
  const varIndex = Math.floor(0.05 * sorted.length);
  const valueAtRisk = Math.abs(sorted[varIndex]);

  // Expected Shortfall (ES) at 95% confidence
  const losses = sorted.slice(0, varIndex + 1);
  const expectedShortFall = Math.abs(
    losses.reduce((a, b) => a + b, 0) / losses.length,
  );

  // Max Drawdown
  let maxDrawDown = 0;
  let peak = returns[0];
  let trough = returns[0];
  let mdd = 0;
  let runningMax = returns[0];
  for (let i = 1; i < returns.length; i++) {
    runningMax = Math.max(runningMax, returns[i]);
    mdd = (returns[i] - runningMax) / runningMax;
    if (mdd < maxDrawDown) {
      maxDrawDown = mdd;
      trough = returns[i];
      peak = runningMax;
    }
  }
  maxDrawDown = Math.abs(maxDrawDown);

  return {
    correlation,
    valueAtRisk,
    expectedShortFall,
    maxDrawDown,
  };
}
