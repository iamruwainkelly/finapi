function getMomentumExposure(ticker, historical) {
  // const today = new Date();
  // const startDate = new Date();
  // startDate.setFullYear(today.getFullYear() - 1);
  // startDate.setDate(startDate.getDate() - 30); // ensure we get 12+ months of data

  // const historical = await yahooFinance.historical(ticker, {
  //   period1: startDate,
  //   period2: today,
  //   interval: "1d",
  // });

  console.log('historical.length:' + historical.length);

  if (historical.length < 252 + 21) {
    throw new Error('Not enough data to calculate momentum exposure.');
  }

  historical.sort((a, b) => new Date(a.date) - new Date(b.date));
  const price_252 = historical[historical.length - 252].close;
  const price_21 = historical[historical.length - 21].close;

  const momentumExposure = (price_21 - price_252) / price_252;

  console.log(
    `Momentum exposure for ${ticker}: ${(momentumExposure * 100).toFixed(2)}%`,
  );
  return momentumExposure;
}

export async function analyzeStock(marketIndex, ticker) {
  const stockData = await fetchHistoricalData(ticker);
  const marketData = await fetchHistoricalData(marketIndex);

  const stockPrices = stockData.map((d) => d.close);
  const marketPrices = marketData.map((d) => d.close);

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

  // MOMENTUM: approx. 12-month return minus 1 month (just rough proxy)
  //const momentum =
  //    (stockPrices[stockPrices.length - 22] - stockPrices[0]) / stockPrices[0];

  // Calculate 12-month momentum minus last month for GOOG in Node.js
  // Assuming you have a DataFrame-like structure (e.g., Danfo.js DataFrame) called goog
  // 252 trading days ≈ 12 months, shift by 21 days (1 month)

  // const adjClose = goog["Adj Close"].values;
  // let momentumX = new Array(adjClose.length).fill(null);
  // for (let i = 0; i < adjClose.length; i++) {
  //   if (i >= 252 + 21) {
  //     momentum[i] =
  //       (adjClose[i - 21] - adjClose[i - 252 - 21]) / adjClose[i - 252 - 21];
  //   }
  // }

  // const momentum = goog
  //   .map((row, i, arr) => {
  //     if (i < 252 + 21) return null;
  //     return (
  //       (row.adjclose - arr[i - 252].adjclose) / arr[i - 252].adjclose -
  //       (row.adjclose - arr[i - 21].adjclose) / arr[i - 21].adjclose
  //     );
  //   })
  //   .filter((x) => x !== null);

  const momentum = getMomentumExposure(ticker, stockData);

  // VOLATILITY: inverse of standard deviation
  const volatility = std(alignedStockReturns);
  const vol_factor_exposure = 1 / volatility;
  const avg_vol_factor_return = 1 / std(alignedMarketReturns);
  const contribution_volatility = vol_factor_exposure * avg_vol_factor_return;

  // FUNDAMENTALS
  const summary = await yahooFinance.quoteSummary(SYMBOL, {
    modules: ['defaultKeyStatistics', 'financialData'],
  });
  const info = summary.defaultKeyStatistics;

  const pb = info.priceToBook || 10;
  const roe = summary.financialData.returnOnEquity || 0.2;
  const marketCap = info.marketCap || 1e12;

  const value_exposure = 1 / pb;
  const quality_exposure = roe;
  const size_exposure = -Math.log(marketCap / 1e11);

  const contribution_value = value_exposure * 0.01;
  const contribution_quality = quality_exposure * 0.01;
  const contribution_size = size_exposure * 0.01;
  const contribution_momentum = momentum * 0.01;

  const contributions = {
    Market: contribution_market,
    Size: contribution_size,
    Value: contribution_value,
    Momentum: contribution_momentum,
    Quality: contribution_quality,
    Volatility: contribution_volatility,
  };

  const exposures = {
    Market: beta_market,
    Size: size_exposure,
    Value: value_exposure,
    Momentum: momentum,
    Quality: quality_exposure,
    Volatility: vol_factor_exposure,
  };

  const total = Object.values(contributions).reduce(
    (sum, val) => sum + Math.abs(val),
    0,
  );
  const contribution_percent = Object.fromEntries(
    Object.entries(contributions).map(([k, v]) => [
      k,
      (100 * Math.abs(v)) / total,
    ]),
  );

  // Display results
  console.table(
    Object.keys(exposures).map((key) => ({
      Factor: key,
      Exposure: exposures[key], //?.toFixed(4),
      'Contribution (%)': contribution_percent[key], //?.toFixed(2),
    })),
  );
}
