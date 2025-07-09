// IIFE

import yahooFinance from 'yahoo-finance2';
// fs
import { promises as fs } from 'fs';

const symbol = 'AAPL'; // S&P 500 Index

(async () => {
  const results = await yahooFinance.quote(symbol);

  // write the results to a file for debugging purposes

  const outputPath = `./output/yahoo-finance-quote-${symbol.replaceAll('^', '')}.json`;
  await fs.writeFile(outputPath, JSON.stringify(results, null, 2));

  return results;
})();
