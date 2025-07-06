import { History } from '../../entities/history.entity';
import yahooFinance from 'yahoo-finance2';
import { AppDataSource } from '../../data-source';
import { differenceInMinutes, toDate, isToday } from 'date-fns';
import { HistoryMinimal } from 'src/typings/HistoryMinimal';
import { re } from 'mathjs';

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
      interval: '1d',
    });

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

  // function getHistoryMinimal that takes in History[] amd returns HistoryMinimal[]
  convertToMinimal = (history: History[]): HistoryMinimal[] => {
    return history.map((entry) => ({
      date: entry.date,
      close: entry.close ?? 0,
    }));
  };

  // getHistoryMinimal
  getHistoryMinimal = async (symbol: string): Promise<HistoryMinimal[]> => {
    const history = await this.history(symbol);
    return this.convertToMinimal(history);
  };

  history = async (symbol: string): Promise<History[]> => {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    // trim the symbol to ensure it is in uppercase
    symbol = symbol.trim().toUpperCase();

    // Query the database for the symbol
    const history = await AppDataSource.getRepository(History)
      .createQueryBuilder('history')
      .where('history.symbol = :symbol', { symbol })
      .orderBy('history.date', 'ASC')
      .getMany();

    // get current date and time in getTime format
    const now = new Date();

    // if there is history, check the last entry and see if that entry created date is older than one minute
    if (history.length > 0) {
      // get handle to the last entry in history
      const lastEntry = history[history.length - 1];

      // check if last entry is today
      const isTodayLastEntry = isToday(toDate(lastEntry.created));

      // if still today, return the history
      if (isTodayLastEntry) return history;
    }

    // If not found or outdated, fetch from Yahoo Finance
    const newHistory = await this.fetchHistoricalData(symbol);

    // map the new history to the History entity
    if (!newHistory || newHistory.length === 0) {
      throw new Error(`No historical data found for symbol: ${symbol}`);
    }

    // save the new history to the database
    const historyRepository = AppDataSource.getRepository(History);
    const currentTimestamp = now.getTime();
    const historyEntities = newHistory.map((entry) => {
      const historyEntry = new History();
      historyEntry.symbol = symbol;
      historyEntry.date = entry.date.getTime(); // Convert date to timestamp
      historyEntry.dateString = entry.date.toISOString().split('T')[0]; // Format date as YYYY-MM-DD
      historyEntry.close = entry.close;
      historyEntry.open = entry.open;
      historyEntry.high = entry.high;
      historyEntry.low = entry.low;
      historyEntry.volume = entry.volume;
      historyEntry.adjclose = entry.adjclose || entry.close;
      historyEntry.created = currentTimestamp;
      return historyEntry;
    });

    // clear existing history for the symbol
    await historyRepository.delete({ symbol });

    // Save the new history entries to the database
    await historyRepository.save(historyEntities);

    // Return the newly fetched history from db
    return AppDataSource.getRepository(History)
      .createQueryBuilder('history')
      .where('history.symbol = :symbol', { symbol })
      .orderBy('history.date', 'ASC')
      .getMany();
  };
}
