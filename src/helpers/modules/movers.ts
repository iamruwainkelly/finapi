import { JsonMarketMover } from 'src/typings/JsonMarketMover';
import { Stock } from 'src/typings/Stock';

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

export const getGainers = (data: any): JsonMarketMover[] => {
  const quotes = data.props.pageProps.state.quotesStore.quotes;
  const gainers = quotes.find(
    ([key]: any[]) =>
      key.startsWith('indexGainers') && key.endsWith('-stocks.gainersLosers'),
  );
  return gainers ? gainers[1]._collection : [];
};

export const getLosers = (data: any): JsonMarketMover[] => {
  const quotes = data.props.pageProps.state.quotesStore.quotes;
  const losers = quotes.find(
    ([key]: any[]) =>
      key.startsWith('indexLosers') && key.endsWith('-stocks.gainersLosers'),
  );
  return losers ? losers[1]._collection : [];
};

export const parseTable = ($: any, headerText: string) => {
  const result: {
    ticker: string;
    name: string;
    price: string;
    priceChange: string;
    percentChange: string;
  }[] = [];
  // Find the h2 with the headerText, then the next table
  $('h2').each((_: any, el: any) => {
    if ($(el).text().trim() === headerText) {
      const table = $(el).parent().next('div').find('table');
      table.find('tbody tr').each((_: any, row: any) => {
        const tds = $(row).find('td');
        const ticker = tds.eq(0).find('span').eq(1).text().trim();
        const name = tds.eq(0).find('div').eq(1).text().trim();
        const price = tds.eq(1).find('span').eq(0).text().trim();
        const priceChange = tds.eq(1).find('span').eq(1).text().trim();
        const percentChange = tds.eq(1).find('span').eq(2).text().trim();
        result.push({ ticker, name, price, priceChange, percentChange });
      });
    }
  });
  return result;
};
