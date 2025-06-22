import { History } from "../../entities/history.entity";
import yahooFinance from "yahoo-finance2";
import { AppDataSource } from "../../data-source";

export class HistoryModule {
  constructor() {}

  fetchHistoricalData = async (symbol: string) => {
    const today = new Date();
    const startDate = new Date();
    startDate.setFullYear(today.getFullYear() - 5);
    startDate.setDate(startDate.getDate() - 60);

    const result = await yahooFinance.chart(symbol, {
      period1: startDate,
      period2: today,
      interval: "1d",
    });

    // print length of result and result2
    console.log(
      `Fetched historical data for ${symbol}: result length = ${result.quotes.length}`,
    );

    return result.quotes
      .map((entry) => ({
        date: entry.date,
        close: entry.adjclose || entry.close,
        open: entry.open,
        high: entry.high,
        low: entry.low,
        volume: entry.volume,
        adjclose: entry.adjclose || entry.close,
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  };

  history = async (symbol: string): Promise<History[]> => {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    // trim the symbol to ensure it is in uppercase
    symbol = symbol.trim().toUpperCase();

    // Query the database for the symbol
    const history = await AppDataSource.getRepository(History)
      .createQueryBuilder("history")
      .where("history.symbol = :symbol", { symbol })
      .orderBy("history.date", "ASC")
      .getMany();

    // If history is found and is recent, return it
    if (
      history.length &&
      history[0].created > Date.now() - 24 * 60 * 60 * 1000
    ) {
      console.log(
        `History for ${symbol} found in database, returning cached data...`,
      );
      return history;
    }

    // If not found or outdated, fetch from Yahoo Finance
    console.log(
      `History for ${symbol} not found or outdated, fetching fresh data...`,
    );
    const newHistory = await this.fetchHistoricalData(symbol);

    // map the new history to the History entity
    if (!newHistory || newHistory.length === 0) {
      throw new Error(`No historical data found for symbol: ${symbol}`);
    }

    // save the new history to the database
    console.log(`Saving new history for ${symbol} to the database...`);
    const historyRepository = AppDataSource.getRepository(History);
    const historyEntities = newHistory.map((entry) => {
      const historyEntry = new History();
      historyEntry.symbol = symbol;
      historyEntry.date = entry.date.getTime(); // Convert date to timestamp
      historyEntry.dateString = entry.date.toISOString().split("T")[0]; // Format date as YYYY-MM-DD
      historyEntry.close = entry.close;
      historyEntry.open = entry.open;
      historyEntry.high = entry.high;
      historyEntry.low = entry.low;
      historyEntry.volume = entry.volume;
      historyEntry.adjclose = entry.adjclose || entry.close;
      historyEntry.created = new Date().getTime();
      return historyEntry;
    });

    // Save the new history entries to the database
    console.log(`Saving ${historyEntities.length} history entries...`);
    await historyRepository.save(historyEntities, {
      // chunk: 100, // Save in chunks of 100 to avoid memory issues
    });

    // Return the newly fetched history from db
    console.log(`History for ${symbol} saved successfully.`);
    return AppDataSource.getRepository(History)
      .createQueryBuilder("history")
      .where("history.symbol = :symbol", { symbol })
      .orderBy("history.date", "ASC")
      .getMany();
  };
}
