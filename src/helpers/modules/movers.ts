import { MarketMover } from 'src/typings/MarketMover';
import { Stock } from 'src/typings/Stock';
import * as cheerio from 'cheerio';

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

export const getGainers = (data: any): MarketMover[] => {
  const quotes = data.props.pageProps.state.quotesStore.quotes;
  const gainers = quotes.find(
    ([key]: any[]) =>
      key.startsWith('indexGainers') && key.endsWith('-stocks.gainersLosers'),
  );
  return gainers ? gainers[1]._collection : [];
};

export const getLosers = (data: any): MarketMover[] => {
  const quotes = data.props.pageProps.state.quotesStore.quotes;
  const losers = quotes.find(
    ([key]: any[]) =>
      key.startsWith('indexLosers') && key.endsWith('-stocks.gainersLosers'),
  );
  return losers ? losers[1]._collection : [];
};
