export function formatChartToHistorical(chartData: any) {
  if (
    !chartData ||
    !chartData.timestamp ||
    !chartData.indicators ||
    !chartData.indicators.quote
  ) {
    throw new Error('Invalid chart data');
  }

  const timestamps = chartData.timestamp;
  const quote = chartData.indicators.quote[0];

  return timestamps.map((timestamp: number, i: number) => {
    return {
      date: new Date(timestamp * 1000), // Convert seconds to milliseconds
      open: quote.open[i] ?? null,
      high: quote.high[i] ?? null,
      low: quote.low[i] ?? null,
      close: quote.close[i] ?? null,
      volume: quote.volume[i] ?? null,
      adjclose: quote.adjclose ? (quote.adjclose[i] ?? null) : null,
    };
  });
}
