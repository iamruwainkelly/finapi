import { MarketMover } from 'src/typings/MarketMover';
import { Stock } from 'src/typings/Stock';
import * as cheerio from 'cheerio';

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

export function parseTable(html: string, tableSelector: string): MarketMover[] {
  const $ = cheerio.load(html);
  const rows = $(`${tableSelector} table tbody tr`);
  const data: MarketMover[] = [];
  rows.each((_, row) => {
    const $row = $(row);
    const tickerLink = $row.find('a[data-test="gainers-losers-url"]');
    const ticker = tickerLink.find('span.font-semibold').first().text().trim();
    const tickerName = tickerLink
      .find('[data-test="gainers-losers-label"]')
      .text()
      .trim();
    const price = $row
      .find('[data-test="gainers-losers-last"]')
      .text()
      .replace(/,/g, '')
      .trim();
    const changeSpans = $row.find('[data-test="gainers-losers-change"] span');
    let priceChange = '',
      percentChange = '';
    if (changeSpans.length === 2) {
      priceChange = $(changeSpans[0]).text().trim();
      percentChange = $(changeSpans[1]).text().replace(/[()]/g, '').trim();
    }

    let mover = {} as MarketMover;
    mover.symbol = ticker;
    mover.name = tickerName;
    mover.price = parseFloat(price);
    mover.change = parseFloat(priceChange.replace(/[^0-9.-]+/g, ''));
    mover.changePercent = percentChange.replace(/[^0-9.-]+/g, '');
    data.push(mover);
  });
  return data;
}
