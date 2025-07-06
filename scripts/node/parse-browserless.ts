interface MarketMover {
  symbol: string;
  name?: string;
  volume?: number;
  avgVolume?: number;
  change?: number;
  changeDirection?: string;
  changePercent: string;
  price: number;
  [key: string]: any;
}

interface Stock {
  symbol: string;
  name?: { label: string };
  change: number;
  changePercent: string;
  last: number;
  changeDirection: string;
  [key: string]: any;
}

// read ./browserql_content_2025-06-30T10-49-01-998Z.json file
import * as fs from 'node:fs';
import * as cheerio from 'cheerio';
// import { extractStocks, getTopMovers } from '../../src/helpers/modules/movers';

// Helper to flatten and extract all stocks
export function extractStocks(data: any): Stock[] {
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

function parseTable(html: string, tableSelector: string) {
  const $ = cheerio.load(html);
  const rows = $(`${tableSelector} table tbody tr`);
  const data: any[] = [];
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
    data.push({ ticker, tickerName, price, priceChange, percentChange });
  });
  return data;
}

// iffe to run the script immediately
// eslint-disable-next-line @typescript-eslint/no-unused-vars
(async () => {
  try {
    const fileData = fs.readFileSync(
      'browserql_content_2025-06-30T10-49-01-998Z.json',
      'utf8',
    );
    const jsonData = JSON.parse(fileData);

    // parse the htmlContent as html string in json
    // and use cheerio to load it
    const htmlContent = jsonData.data.html.html;

    console.log('HTML Content Length:', htmlContent);

    // write the htmlContent to a file
    const now = new Date();
    const dateStr = now.toISOString().replace(/[:.]/g, '-');
    const filename = `browserql_content_${dateStr}.html`;
    fs.writeFileSync(filename, htmlContent, 'utf8');
    console.log(`HTML content saved to ${filename}`);

    // load the content into cheerio
    const $ = cheerio.load(htmlContent);

    const gainers = parseTable(htmlContent, '[data-test="gainers-table"]');
    const losers = parseTable(htmlContent, '[data-test="losers-table"]');

    console.log('\nTop Gainers:');
    console.table(gainers);
    console.log('\nTop Losers:');
    console.table(losers);

    return { gainers, losers };
  } catch (error) {
    console.error('Error:', error);
  }
})();
