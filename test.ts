import 'reflect-metadata';
import { HistoryModule } from './src/helpers/modules/history';

async function main() {
  const historyModule = new HistoryModule();
  const symbol = 'AAPL'; // Example symbol
  try {
    const historicalData = await historyModule.history(symbol);
    console.log(`Historical data for ${symbol}:`, historicalData);
  } catch (error) {
    console.error(`Error fetching historical data for ${symbol}:`, error);
  }
}

main();
