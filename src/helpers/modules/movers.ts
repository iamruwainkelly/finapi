import { MarketMover } from 'src/typings/MarketMover';
import { Stock } from 'src/typings/Stock';

// Helper to flatten and extract all stocks
export function extractStocks(data: any): Stock[] {
  // console.log()

  const stocks: Stock[] = [];
  for (const section of data.props.pageProps.state.quotesStore.quotes) {
    if (
      Array.isArray(section) &&
      section.length === 2 &&
      section[1]._collection
    ) {
      stocks.push(...section[1]._collection);
    }
  }
  return stocks;
}

export function getTopMovers(
  stocks: Stock[],
  direction: 'Up' | 'Down' = 'Up',
  topN = 5,
): Array<MarketMover> {
  return stocks
    .filter((stock) => stock.changeDirection === direction)
    .sort(
      (a, b) =>
        Math.abs(parseFloat(b.changePercent)) -
        Math.abs(parseFloat(a.changePercent)),
    )
    .slice(0, topN)
    .map((stock) => ({
      symbol: stock.symbol,
      name: stock.name?.label,
      volume: stock.volume,
      avgVolume: stock.avgVolume,
      change: stock.change,
      changePercent: stock.changePercent,
      price: stock.last,
    }));
}

// Example usage (uncomment for CLI/test):
// const data: MarketMoversData = JSON.parse(fs.readFileSync('a.json', 'utf-8'));
// const stocks = extractStocks(data);
// console.log('\nTop Gainers:');
// console.table(getTopMovers(stocks, 'Up'));
// console.log('\nTop Losers:');
// console.table(getTopMovers(stocks, 'Down'));
