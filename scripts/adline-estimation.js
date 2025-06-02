const yahooFinance = require('yahoo-finance2').default;

async function getADLine(ticker, months = 3) {
  const now = new Date();
  const past = new Date();
  past.setMonth(now.getMonth() - months);

  const history = await yahooFinance.historical(ticker, {
    period1: past,
    period2: now,
    interval: '1d',
  });

  let adLine = 0;
  const result = [];

  for (const day of history) {
    const { open, high, low, close, volume, date } = day;

    if (!high || !low || high === low) continue;

    const mfMultiplier = (close - low - (high - close)) / (high - low);
    const mfVolume = mfMultiplier * volume;
    adLine += mfVolume;

    result.push({
      date: date.toISOString().split('T')[0],
      close,
      volume,
      adLine: parseFloat(adLine.toFixed(2)),
      sentiment:
        mfMultiplier > 0
          ? 'Buying Pressure'
          : mfMultiplier < 0
            ? 'Selling Pressure'
            : 'Neutral',
    });
  }

  return result;
}

// Example usage
getADLine('AAPL', 3)
  .then((data) => {
    console.table(data.slice(-10)); // Show last 10 days
  })
  .catch((err) => console.error('Error:', err));
