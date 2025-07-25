import yahooFinance from 'yahoo-finance2';
import { analysis, metrics } from '../../src/helpers/modules/risk';
// import { metrics } from 'src/helpers/modules/risk';

(async function () {
  const aaplHistory = await yahooFinance.historical('AAPL', {
    period1: '2023-01-01',
    period2: '2024-01-01',
    interval: '1d',
  });
  const spyHistory = await yahooFinance.historical('SPY', {
    period1: '2023-01-01',
    period2: '2024-01-01',
    interval: '1d',
  });

  // Extract close prices
  const aaplPrices = aaplHistory.map((d) => d.close).filter(Boolean);
  const spyPrices = spyHistory.map((d) => d.close).filter(Boolean);

  // Calculate daily returns
  const getReturns = (prices: number[]) =>
    prices.slice(1).map((p, i) => (p - prices[i]) / prices[i]);
  const aaplReturns = getReturns(aaplPrices);
  const spyReturns = getReturns(spyPrices);

  // Calculate risk metrics for AAPL vs SPY
  //const result = metrics(aaplReturns, spyReturns);
  const result = analysis('SPY', 'AAPL');
})();
