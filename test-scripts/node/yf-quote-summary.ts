// IIFE

import yahooFinance from 'yahoo-finance2';
// fs
import { promises as fs } from 'fs';

const symbol = 'AAPL'; // Apple Inc.

(async () => {
  const results: any = await yahooFinance.quoteSummary(symbol, {
    modules: [
      'defaultKeyStatistics',
      'financialData',
      'summaryDetail',
      'price',
      // Add more modules as needed
    ],
  });

  // write the results to a file for debugging purposes

  const outputPath = `./output/yahoo-finance-quote-summary-${symbol.replaceAll('^', '')}.json`;
  await fs.writeFile(outputPath, JSON.stringify(results, null, 2));
  //await fs.writeFile(outputPath, results, 'utf8');

  return results;
})();
