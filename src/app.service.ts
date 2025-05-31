import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Index } from './entities/index.entity';
// stock
import { Stock } from './entities/stock.entity'; // Assuming you have a Stock entity
import { DataSource, In } from 'typeorm';
import * as fs from 'node:fs';
import * as path from 'node:path';
import axios from 'axios';
import { parse } from 'csv-parse/sync';
import { SymbolMapping } from './typings/SymbolMapping';
import { MarketIndex } from './typings/MarketIndex';
import { MarketSymbol } from './typings/MarketSymbol';

import * as cheerio from 'cheerio';
import yahooFinance from 'yahoo-finance2';
import { Quote } from './entities/quote.entity';
import { IndexQuote } from './typings/IndexQuote';
import { Cron } from './entities/cron.entity';
import { Setting } from './entities/setting.entity';
import { History } from './entities/history.entity';
import { GainersAndLosers } from './typings/MarketMover';
import { chromium, LaunchOptions, Browser } from 'playwright';
import { MarketMover } from './entities/marketMover.entity';
import { News } from './entities/news.entity';

import { Logger as TypeOrmLogger } from 'typeorm';

import { LogEntry } from './entities/logentry.entity';

const options: LaunchOptions = {
  headless: true,
  slowMo: 100,
  // set some args to make playwright behave more like a real browser
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-web-security',
    '--disable-features=IsolateOrigins,site-per-process',
    '--allow-insecure-localhost',
  ],
  ignoreDefaultArgs: ['--enable-automation'],
};

// create an array of user agents
const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3',
  'Mozilla/5.0 (Windows NT 10.0; WOW64; rv:55.0) Gecko/20100101 Firefox/55.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3',
];

const contextOptions = {
  viewport: { width: 1280, height: 800 },
  userAgent: userAgents[Math.floor(Math.random() * userAgents.length)],
  deviceScaleFactor: 1,
};

export class DatabaseLogger implements TypeOrmLogger {
  constructor(private dataSource: DataSource) {}

  logQuery(query: string, parameters?: any[], queryRunner?: any) {
    this.log('log', query + ' ' + JSON.stringify(parameters));
  }
  logQueryError(
    error: string,
    query: string,
    parameters?: any[],
    queryRunner?: any,
  ) {
    this.log('warn', error + ' | ' + query + ' ' + JSON.stringify(parameters));
  }
  logQuerySlow(
    time: number,
    query: string,
    parameters?: any[],
    queryRunner?: any,
  ) {
    this.log(
      'warn',
      `Slow query (${time}ms): ${query} ${JSON.stringify(parameters)}`,
    );
  }
  logSchemaBuild(message: string, queryRunner?: any) {
    this.log('info', message);
  }
  logMigration(message: string, queryRunner?: any) {
    this.log('info', message);
  }
  log(level: 'log' | 'info' | 'warn', message: any, queryRunner?: any) {
    const logRepo = this.dataSource.getRepository(LogEntry);
    const entry = logRepo.create({ level, message: String(message) });
    logRepo.save(entry);
  }
}

@Injectable()
export class AppService implements OnModuleInit, OnModuleDestroy {
  private browser: Browser;

  constructor(
    // @InjectRepository(Index)
    private dataSource: DataSource,
  ) {}

  runCron = async (cron: Cron) => {
    // execute the task based on the cronName and methodName
    // execute the method dynamically
    const method = (this as any)[cron.method];
    if (typeof method === 'function') {
      // Log to logger instead of console
      this.dataSource.getRepository(LogEntry).save({
        level: 'info',
        message: `Running cron: ${cron.name} with method: ${cron.method}`,
        context: 'runCron',
      });
      await method.call(this);

      // update cron table to set the last run date
      const cronRepository = this.dataSource.getRepository(Cron);
      const now = new Date();

      await cronRepository.update(cron.id, {
        lastRun: now.getTime(),
        lastRunAt: now.toISOString(),
      });
      this.dataSource.getRepository(LogEntry).save({
        level: 'info',
        message: `Cron ${cron.name} completed successfully.`,
        context: 'runCron',
      });
    } else {
      this.dataSource.getRepository(LogEntry).save({
        level: 'error',
        message: `Method ${cron.method} not found for cron: ${cron.name}`,
        context: 'runCron',
      });
    }
  };

  // Function to initialize the settings table data from the settings.json file\
  initializeSettingsData = async () => {
    // get data from file ~/src/data/settings.json
    const settingsData: { key: string; value: string }[] = JSON.parse(
      fs.readFileSync(path.join('./src', 'data', 'settings.json'), 'utf-8'),
    );

    // create an array of settings keys from the settingsData
    const settingsKeys = settingsData.map((data) => data.key);

    // check if the settings already exist in the database
    const settingsRepository = this.dataSource.getRepository(Setting);

    const existingSettings = await settingsRepository.find({
      where: {
        key: In(settingsKeys),
      },
    });

    // for the settings not found in the database, create them
    const settingsToCreate = settingsKeys.filter(
      (key) => !existingSettings.some((setting: any) => setting.key === key),
    );

    // if there are no settings to create, return
    if (settingsToCreate.length === 0) {
      this.dataSource.getRepository(LogEntry).save({
        level: 'info',
        message:
          'Settings table already initialized. No new settings to create.',
        context: 'initializeSettingsData',
      });
      return;
    }

    // filter the settingsData to only include the settings to create
    const settingsToCreateData = settingsData.filter((data) =>
      settingsToCreate.includes(data.key),
    );

    // if there are settings to create, create them
    const settingsToCreateEntities = settingsToCreateData.map((data) => {
      const setting = new Setting();
      setting.key = data.key;
      setting.value = data.value;

      return setting;
    });

    await settingsRepository.save(settingsToCreateEntities);
  };

  initializeIndexData = async () => {
    // get data from file ~/src/data/indexes.json
    const indicesData: MarketIndex[] = JSON.parse(
      fs.readFileSync(
        path.join('./src', 'data', 'JsonIndexData.json'),
        'utf-8',
      ),
    );

    // create an array of index symbols from the indicesData
    const indexSymbols = indicesData.map((data) => data.yahooFinanceSymbol);

    // check if the indices already exist in the database
    const indexRepository = this.dataSource.getRepository(Index);
    const indices = await indexRepository.find({
      where: {
        symbol: In(indexSymbols),
      },
    });

    // for the indexes not found in the database, create them
    const indicesToCreate = indexSymbols.filter(
      (symbol) => !indices.some((index: any) => index.symbol === symbol),
    );

    // if there are no indices to create, return
    const indicesToCreateData = indicesData.filter((data) =>
      indicesToCreate.includes(data.yahooFinanceSymbol),
    );

    // if there are indices to create, create them

    const indicesToCreateEntities = indicesToCreateData.map((data) => {
      const index = new Index();
      index.symbol = data.yahooFinanceSymbol;
      index.investingSymbol = data.investingSymbol;
      index.investingUrlName = data.investingUrlName;
      index.created = new Date().getTime();

      return index;
    });

    await indexRepository.save(indicesToCreateEntities);
    await this.dataSource.getRepository(LogEntry).save({
      level: 'info',
      message: 'Index table checked and initialized (if needed).',
      context: 'initializeIndexData',
    });
  };

  initializeIndexStockData = async () => {
    const IndexesJsonData: MarketIndex[] = JSON.parse(
      fs.readFileSync(
        path.join('./src', 'data', 'JsonIndexData.json'),
        'utf-8',
      ),
    );

    // loop through each index and if the stockListSourceType is 'csv', fetch the CSV and save the stocks to the database
    for (const jsonIndex of IndexesJsonData) {
      const stockConfig = jsonIndex.stockConfig;

      // verify that stocks have already been fetched for this index
      const stockRepository = this.dataSource.getRepository(Stock);
      const existingStocks = await stockRepository.find({
        where: { index: { symbol: jsonIndex.yahooFinanceSymbol } },
      });

      if (existingStocks.length > 0) {
        this.dataSource.getRepository(LogEntry).save({
          level: 'info',
          message: `Stocks for index ${jsonIndex.yahooFinanceSymbol} already exist in the database. Skipping.`,
          context: 'initializeIndexStockData',
        });
        continue; // Skip to the next index if stocks already exist
      }

      let stocks: MarketSymbol[] = [];

      // switch based on the stockListSourceType
      switch (stockConfig.sourceType) {
        case 'csv': {
          const mapping: SymbolMapping = {
            symbolKey: stockConfig.symbolKey,
            nameKey: stockConfig.nameKey,
          };

          // Fetch stocks from CSV
          stocks = await getStocksFromCsv(stockConfig.sourceUrl, mapping);

          break;
        }

        case 'wikipedia': {
          const mapping: SymbolMapping = {
            symbolKey: stockConfig.symbolKey,
            nameKey: stockConfig.nameKey,
          };

          // Fetch stocks from Wikipedia
          stocks = await getStocksFromWikipedia(
            stockConfig.sourceUrl,
            stockConfig.tableCssPath,
            mapping,
          );

          break;
        }
      }

      // Save stocks to the database
      const indexRepository = this.dataSource.getRepository(Index);
      const index = await indexRepository.findOne({
        where: { symbol: jsonIndex.yahooFinanceSymbol },
      });

      if (!index) {
        this.dataSource.getRepository(LogEntry).save({
          level: 'error',
          message: `Index ${jsonIndex.yahooFinanceSymbol} not found in the database. Skipping.`,
          context: 'initializeIndexStockData',
        });
        continue;
      }

      const stockEntities = stocks.map((stock) => {
        const stockEntity = new Stock(); // Assuming you have a Stock entity
        stockEntity.symbol = stock.symbol;
        stockEntity.name = stock.name;
        stockEntity.index = index; // Set the index relation
        stockEntity.indexSymbol = index.symbol; // Set the index relation
        stockEntity.created = new Date().getTime();

        return stockEntity;
      });

      await stockRepository.save(stockEntities);
      this.dataSource.getRepository(LogEntry).save({
        level: 'info',
        message: `Stocks for index ${jsonIndex.yahooFinanceSymbol} saved successfully.`,
        context: 'initializeIndexStockData',
      });
    }
  };

  // create func to get all tasks from settings table
  initializeCronJobs = async () => {
    // get cron jobs from crons.json file
    const cronData: Cron[] = JSON.parse(
      fs.readFileSync(path.join('./src', 'data', 'crons.json'), 'utf-8'),
    );

    // check if the crons already exist in the database
    const existingCrons = await this.dataSource.getRepository(Cron).find({
      where: { name: In(cronData.map((cron) => cron.name)) },
    });

    // filter the crons to only include the ones that do not exist in the database
    const cronsToCreate = cronData.filter(
      (cron) =>
        !existingCrons.some((existingCron) => existingCron.name === cron.name),
    );

    // if there are no crons to create, return
    if (cronsToCreate.length === 0) {
      this.dataSource.getRepository(LogEntry).save({
        level: 'info',
        message: 'Cron jobs already initialized. No new crons to create.',
        context: 'initializeCronJobs',
      });
      // return;
    } else {
      this.dataSource.getRepository(LogEntry).save({
        level: 'info',
        message: `Found ${cronsToCreate.length} new cron jobs to create.`,
        context: 'initializeCronJobs',
      });

      // create the crons in the database
      const cronRepository = this.dataSource.getRepository(Cron);
      const cronEntities = cronsToCreate.map((cron) => {
        const cronEntity = new Cron();
        cronEntity.name = cron.name;
        cronEntity.description = cron.description;
        cronEntity.method = cron.method;
        cronEntity.interval = cron.interval;
        cronEntity.enabled = cron.enabled;

        return cronEntity;
      });

      await cronRepository.save(cronEntities);
    }

    // find all crons in the database whose enabled is true
    const cronRepository = this.dataSource.getRepository(Cron);
    const crons = await cronRepository.find({
      where: { enabled: true },
      order: { id: 'ASC' }, // Order by id ascending
    });

    // loop througheach crons and add run with setInterval and runTask
    const cronTasks = crons.map((cron) => {
      // Run the task immediately
      this.runCron(cron);

      // Set an interval to run the task every cron.interval minutes
      setInterval(
        async () => {
          this.dataSource.getRepository(LogEntry).save({
            level: 'info',
            message: `Running scheduled task: ${cron.name}`,
            context: 'initializeCronJobs',
          });
          await this.runCron(cron);
        },
        cron.interval * 60 * 1000,
      ); // Convert minutes to milliseconds

      // run the task once immediately
      // this.runCron(cron);

      return { id: cron.id, description: cron.name };
    });
  };

  async getIndexQuotes(): Promise<IndexQuote[]> {
    // declare avar to check if we need to refetch quotes
    let refetch = false;

    // get all indexes from the database
    const indexes = await this.dataSource
      .getRepository(Index)
      .createQueryBuilder('index')
      .getMany();

    // get quoutes for these indexs from the db
    // if the quote already exists, skip it
    const existingQuotes = await this.dataSource
      .getRepository(Quote)
      .createQueryBuilder('quote')
      .where('quote.symbol IN (:...symbols)', {
        symbols: indexes.map((index) => index.symbol),
      })
      .getMany();

    // evaluate whether we need to refetch quotes
    if (existingQuotes.length < indexes.length) {
      // if the number of existing quotes is less than the number of indexes, we need to refetch quotes
      refetch = true;
    } else {
      // check if any of the existing quotes are older than 5 minutes
      const now = new Date();

      // one minute ago
      const oneMinuteAgo = new Date(now.getTime() - 1 * 60 * 1000);
      for (const quote of existingQuotes) {
        // choose either created or updated date, depending on which one is newer
        const lastCreated = new Date(quote.created);
        const lastUpdated = new Date(quote.updated);

        let lastCreatedOrUpdated;

        // use the last updated date if it exists, otherwise use the last created date
        // if lastUpdated is greater than lastCreated, use lastUpdated
        // otherwise use lastCreated
        if (lastUpdated && lastCreated) {
          lastCreatedOrUpdated =
            lastUpdated > lastCreated ? lastUpdated : lastCreated;
        } else if (lastUpdated) {
          lastCreatedOrUpdated = lastUpdated;
        } else {
          lastCreatedOrUpdated = lastCreated;
        }

        // check if the last created or updated date is older than one minute
        // if the last created or updated date is older than one minute, we need to refetch quotes
        // console.log(`Last created or updated date for ${quote.symbol}: ${lastCreatedOrUpdated.toISOString()}`);
        // if the last created or updated date is older than one minute, we need to refetch quotes
        // console.log(`Last created or updated date for ${quote.symbol}: ${lastCreatedOrUpdated.toISOString()}`);
        if (lastCreatedOrUpdated < oneMinuteAgo) {
          refetch = true;

          // log to logger instead of console
          this.dataSource.getRepository(LogEntry).save({
            level: 'warn',
            message: `Quote for index ${quote.symbol} is older than one minute. Refetching.`,
            context: 'getIndexQuotes',
          });

          break; // No need to check further, we already know we need to refetch
        } else {
          // log to logger instead of console
          this.dataSource.getRepository(LogEntry).save({
            level: 'info',
            message: `Quote for index ${quote.symbol} is up to date. Skipping.`,
            context: 'getIndexQuotes',
          });
        }
      }
    }

    // if we need to refetch quotes, delete all quotes for these indexes
    if (refetch) {
      /*
      await this.dataSource
        .getRepository(Quote)
        .createQueryBuilder('quote')
        .delete()
        .where('quote.symbol IN (:...symbols)', {
          symbols: indexes.map((index) => index.symbol),
        })
        .execute();
        */

      this.dataSource.getRepository(LogEntry).save({
        level: 'info',
        message:
          'Refetching quotes for indexes: ' + indexes.map((i) => i.symbol),
        context: 'getIndexQuotes',
      });

      // perform a quoteCombine for each index
      await Promise.all(
        indexes.map(async (index) => {
          let result;
          try {
            result = await yahooFinance.quoteCombine(index.symbol);
          } catch (error) {
            this.dataSource.getRepository(LogEntry).save({
              level: 'error',
              message: `Failed to fetch quote for index ${index.symbol}: ${error.message || error}`,
              context: 'getIndexQuotes',
            });
            return; // Continue to next index
          }

          // set variable to inidicate if record was created or updated
          let recordCreated = false;

          // update quote table by symbol
          // check if the quote already exists
          const existingQuote = await this.dataSource
            .getRepository(Quote)
            .findOne({
              where: { symbol: index.symbol },
            });

          const now = new Date();

          if (existingQuote) {
            // update the existing quote
            existingQuote.json = result;
            existingQuote.updated = now.getTime();
            existingQuote.updatedAt = now.toISOString(); // format date as YYYY-MM-DD
            await this.dataSource.getRepository(Quote).save(existingQuote);
            recordCreated = false; // Indicate that the record was updated
          } else {
            // create a new quote
            const quote = new Quote();
            quote.symbol = index.symbol;
            quote.json = result;
            quote.created = now.getTime();
            await this.dataSource.getRepository(Quote).save(quote);
            recordCreated = true; // Indicate that the record was created
          }

          // log the result
          this.dataSource.getRepository(LogEntry).save({
            level: 'info',
            message: `Quote for index ${index.symbol} ${
              recordCreated ? 'created' : 'updated'
            } successfully.`,
            context: 'getIndexQuotes',
          });
        }),
      );
    }

    //  get quotes for these indexes from the db
    const quotes = await this.dataSource
      .getRepository(Quote)
      .createQueryBuilder('quote')
      .where('quote.symbol IN (:...symbols)', {
        symbols: indexes.map((index) => index.symbol),
      })
      .getMany();

    // return only the json field of the quotes
    const returnObject = quotes.map((quote) => {
      return {
        symbol: quote.symbol,
        quote: quote.json,
      };
    });

    return returnObject;
  }

  // create a function that populate the history table of the index symbols
  // timeAgo data to be fetch must be 1.5 years
  // first fetch indexes from the database, and use their symbols to fetch the history from Yahoo Finance
  // before fetching, make sure there is at least 252 + 21 days of history for each index symbol
  // also make sure that the created date of the historic is not today
  // otherwise refetch the history
  // save the fetched history to the database
  async getIndexHistory(): Promise<void> {
    // get all indexes from the database
    const indexes = await this.dataSource
      .getRepository(Index)
      .createQueryBuilder('index')
      .getMany();

    // loop through each index and fetch the history from the history table
    for (const index of indexes) {
      // check if the index has any history
      const existingHistory = await this.dataSource
        .getRepository(History)
        .createQueryBuilder('history')
        .where('history.symbol = :symbol', { symbol: index.symbol })
        .getMany();

      // print number of existing history records
      this.dataSource.getRepository(LogEntry).save({
        level: 'info',
        message: `Index ${index.symbol} has ${existingHistory.length} history records.`,
        context: 'getIndexHistory',
      });

      // if the index has history, check if it has at least 252 + 21 days of history
      // and that the created date is today, otherwise refetch the history
      if (existingHistory.length > 0) {
        const lastCreated = new Date(
          existingHistory[existingHistory.length - 1].created,
        );

        // print
        this.dataSource.getRepository(LogEntry).save({
          level: 'info',
          message: `Last created date for index ${index.symbol} is ${lastCreated.toISOString()}.`,
          context: 'getIndexHistory',
        });

        const today = new Date();
        const daysDifference = Math.floor(
          (today.getTime() - lastCreated.getTime()) / (1000 * 60 * 60 * 24),
        );

        this.dataSource.getRepository(LogEntry).save({
          level: 'info',
          message: `Days difference for index ${index.symbol} is ${daysDifference}.`,
          context: 'getIndexHistory',
        });

        // print lastCreated.toDateString() and  today.toDateString()
        this.dataSource.getRepository(LogEntry).save({
          level: 'info',
          message: `Last created date: ${lastCreated.toDateString()}, Today: ${today.toDateString()}`,
          context: 'getIndexHistory',
        });

        // if the last created date is today, skip fetching history
        if (
          daysDifference < 252 + 21 &&
          lastCreated.toDateString() === today.toDateString()
        ) {
          this.dataSource.getRepository(LogEntry).save({
            level: 'info',
            message: `Index ${index.symbol} already has enough history. Skipping.`,
            context: 'getIndexHistory',
          });
          continue;
        }
      }

      // fetch the history from Yahoo Finance
      this.dataSource.getRepository(LogEntry).save({
        level: 'info',
        message: `Fetching history for index: ${index.symbol}`,
        context: 'getIndexHistory',
      });

      const result = await yahooFinance.historical(index.symbol, {
        period1: new Date(Date.now() - (252 + 21) * 24 * 60 * 60 * 1000), // 1.5 years ago
        interval: '1d',
      });

      // first delete all existing history for this index
      await this.dataSource
        .getRepository(History)
        .createQueryBuilder('history')
        .delete()
        .where('history.symbol = :symbol', { symbol: index.symbol })
        .execute();

      // save the history to the database, one by one
      const historyRepository = this.dataSource.getRepository(History);
      for (const item of result) {
        const history = new History();
        history.symbol = index.symbol;
        history.date = new Date(item.date).getTime();
        history.dateString = item.date.toISOString(); // format date as YYYY-MM-DD
        history.open = item.open;
        history.high = item.high;
        history.low = item.low;
        history.close = item.close;
        history.volume = item.volume;
        history.adjClose = item.adjClose;
        history.created = new Date().getTime();

        await historyRepository.save(history);
      }
    }
  }

  async getIndexGainersAndLosers(symbol: string): Promise<GainersAndLosers> {
    // check if the index is valid
    const indexRepository = this.dataSource.getRepository(Index);
    const index = await indexRepository.findOne({
      where: { symbol: symbol },
    });

    if (!index) {
      throw new Error(`Index ${index} not found in the database.`);
    }

    // fetch the market movers from investing.com
    const url = `https://za.investing.com/indices/${index.investingUrlName}`;

    const context = await this.browser.newContext(contextOptions);
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    const content = await page.content();
    await context.close(); // Close context when done

    // load the content into cheerio
    const $ = cheerio.load(content);

    // extract json from script id="__NEXT_DATA__" tag
    const json = $('#__NEXT_DATA__').text();

    // parse the json and get the data from the props object
    const data = JSON.parse(json);

    // Access specific data, for example, pageProps
    const pageProps = data.props.pageProps.state.quotesStore.quotes;

    let GainersAndLosers: GainersAndLosers = {
      gainers: [],
      losers: [],
    };

    // loop through array
    for (let i = 0; i < pageProps.length; i++) {
      const prop = pageProps[i];

      // each prop is an array
      for (let j = 0; j < prop.length; j++) {
        const item = prop[j];

        switch (typeof item) {
          case 'string':
            //console.log('String:', item); // log the string

            // if item string ends with 'stocks.gainersLosers'
            if (item.endsWith('stocks.gainersLosers')) {
              // check that item starts with 'indexLosers'
              if (item.startsWith('indexLosers')) {
                // get the next item in the array
                GainersAndLosers.losers = prop[1]._collection;
              } else if (item.startsWith('indexGainers')) {
                // get the next item in the array
                GainersAndLosers.gainers = prop[1]._collection;
              }
            }

            break;
        }
      }
    }

    // return the GainersAndLosers object
    return GainersAndLosers;
  }

  // create function 'getIndexMarketMovers' to get market-movers for each index
  // use puppeteer to scrape the data from investing.com
  async getIndexMarketMovers(): Promise<void> {
    // get all indexes from the database
    const indexes = await this.dataSource
      .getRepository(Index)
      .createQueryBuilder('index')
      .getMany();

    // loop through each index and fetch the market movers
    for (const index of indexes) {
      // check if the index has any market movers
      const marketMoverRepository = this.dataSource.getRepository(MarketMover);
      const existingMarketMovers = await marketMoverRepository.findOne({
        where: { symbol: index.symbol },
      });

      let refetch = false;

      // check if there are existing market movers
      // if there are existing market movers, skip fetching them
      // also check if the created date is not older than 4 hours, otherwise refetch the market movers
      if (existingMarketMovers) {
        const lastCreated = new Date(existingMarketMovers.created);
        const now = new Date();
        const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000);

        // if the last created date is older than 4 hours, refetch the market movers
        if (lastCreated < fourHoursAgo) {
          refetch = true;
          this.dataSource.getRepository(LogEntry).save({
            level: 'info',
            message: `Market movers for index ${index.symbol} are older than 4 hours. Refetching.`,
            context: 'getIndexMarketMovers',
          });
        } else {
          this.dataSource.getRepository(LogEntry).save({
            level: 'info',
            message: `Market movers for index ${index.symbol} already exist and are up to date. Skipping.`,
            context: 'getIndexMarketMovers',
          });
        }
      } else {
        refetch = true;
        this.dataSource.getRepository(LogEntry).save({
          level: 'info',
          message: `No market movers found for index ${index.symbol}. Fetching new data.`,
          context: 'getIndexMarketMovers',
        });
      }

      let GainersAndLosers: GainersAndLosers = {
        gainers: [],
        losers: [],
      };

      if (refetch) {
        GainersAndLosers = await this.getIndexGainersAndLosers(index.symbol);

        // delete all existing market movers for this index
        await marketMoverRepository.delete({ symbol: index.symbol });

        // save the market movers to the database
        // save the GainersAndLosers to the json field of the MarketMover entity
        const marketMover = new MarketMover();
        marketMover.symbol = index.symbol;
        marketMover.json = JSON.stringify(GainersAndLosers);
        marketMover.created = new Date().getTime();
        await marketMoverRepository.save(marketMover);
        this.dataSource.getRepository(LogEntry).save({
          level: 'info',
          message: `Market movers for index ${index.symbol} saved successfully.`,
          context: 'getIndexMarketMovers',
        });
      }
    }

    return; // Return void
  }

  // function to get news for a specific index
  async getIndexNews(): Promise<void> {
    // get all indexes from the database
    const indexes = await this.dataSource
      .getRepository(Index)
      .createQueryBuilder('index')
      .getMany();

    // loop through each index and fetch the news from news table
    // const results = await yahooFinance.search(params.symbol);
    for (const index of indexes) {
      // get news for this index from the database
      const newsRepository = this.dataSource.getRepository(News);
      const existingNews = await newsRepository.findOne({
        where: { symbol: index.symbol },
      });

      let refetch = false;

      // check if there are existing news
      // if there are existing news, skip fetching them
      // also check if the created date is not older than 4 hours, otherwise refetch the news
      if (existingNews) {
        const lastCreated = new Date(existingNews.created);
        const now = new Date();
        const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000);

        // if the last created date is older than 4 hours, refetch the news
        if (lastCreated < fourHoursAgo) {
          refetch = true;
          this.dataSource.getRepository(LogEntry).save({
            level: 'info',
            message: `News for index ${index.symbol} are older than 4 hours. Refetching.`,
            context: 'getIndexNews',
          });
        } else {
          this.dataSource.getRepository(LogEntry).save({
            level: 'info',
            message: `News for index ${index.symbol} already exist and are up to date. Skipping.`,
            context: 'getIndexNews',
          });
        }
      } else {
        refetch = true;
        this.dataSource.getRepository(LogEntry).save({
          level: 'info',
          message: `No news found for index ${index.symbol}. Fetching new data.`,
          context: 'getIndexNews',
        });
      }

      if (refetch) {
        // fetch the news from Yahoo Finance
        this.dataSource.getRepository(LogEntry).save({
          level: 'info',
          message: `Fetching news for index: ${index.symbol}`,
          context: 'getIndexNews',
        });

        const result = await yahooFinance.search(index.symbol);

        // first delete all existing news for this index
        await newsRepository.delete({ symbol: index.symbol });

        // save the news to the database
        // use the result as the json field of the News entity
        const news = new News();
        news.symbol = index.symbol;
        news.json = JSON.stringify(result);
        news.created = new Date().getTime();
        await newsRepository.save(news);

        // log the success message
        this.dataSource.getRepository(LogEntry).save({
          level: 'info',
          message: `News for index ${index.symbol} saved successfully.`,
          context: 'getIndexNews',
        });
      }
    }
  }

  // Utility function to clean up LogEntry table, keeping only the last 100 entries
  async cleanupLogEntries(): Promise<void> {
    const logRepo = this.dataSource.getRepository(LogEntry);
    // Get the ids of the last 100 entries (newest first)
    const last100 = await logRepo.find({
      order: { id: 'DESC' },
      select: ['id'],
      take: 100,
    });
    if (last100.length === 0) return;
    const idsToKeep = last100.map((entry) => entry.id);
    // Delete all entries not in the last 100
    await logRepo
      .createQueryBuilder()
      .delete()
      .where('id NOT IN (:...ids)', { ids: idsToKeep })
      .execute();
    // Optionally log the cleanup
    await logRepo.save({
      level: 'info',
      message: `LogEntry cleanup: kept ${idsToKeep.length} entries, deleted older ones`,
      context: 'cleanupLogEntries',
    });
  }

  async onModuleInit() {
    this.browser = await chromium.launch(options);

    // await this.initializeSettingsData();
    await this.initializeIndexData();
    await this.initializeIndexStockData();

    await this.initializeCronJobs();
  }

  async onModuleDestroy() {
    if (this.browser) {
      await this.browser.close();
    }
  }
}

async function getStocksFromCsv(
  csvUrl: string,
  mapping: SymbolMapping,
  outputPath: string = path.join(
    './src',
    'output',
    new Date().toISOString().replace(/[:.]/g, '-') + '.json',
  ),
): Promise<MarketSymbol[]> {
  try {
    // Fetch the CSV from GitHub
    const response = await axios.get(csvUrl);
    const csv = response.data;

    // Parse CSV content synchronously
    const records: any[] = parse(csv, {
      columns: true,
      skip_empty_lines: true,
    });

    // Map the records to the desired format
    // skip if symbolKey is empty or contains spaces
    const symbols: MarketSymbol[] = records
      .filter(
        (record) =>
          record[mapping.symbolKey] && !/\s/.test(record[mapping.symbolKey]),
      )
      .map((record) => {
        const symbol: MarketSymbol = {
          symbol: record[mapping.symbolKey].trim(),
          name: record[mapping.nameKey]?.trim() || '',
        };
        return symbol;
      });

    // write the symbols to a file ~/src/data/symbols.json
    fs.writeFileSync(outputPath, JSON.stringify(symbols, null, 2));

    return symbols;
  } catch (err) {
    console.error('Failed to fetch or parse CSV:', err.message);
    return [];
  }
}

async function getStocksFromWikipedia(
  url: string,
  tableCssPath: string,
  mapping: SymbolMapping,
): Promise<MarketSymbol[]> {
  try {
    // this.dataSource.getRepository(LogEntry).save({
    //   level: 'info',
    //   message: 'Fetching data from Wikipedia: ' + url,
    //   context: 'getStocksFromWikipedia',
    // });

    // Fetch the HTML content from the URL
    const response = await axios.get(url);
    const html = response.data;

    // write the HTML to a file ~/src/data/wikipedia.html
    fs.writeFileSync(path.join('./src', 'data', 'wikipedia.html'), html);

    // Load the HTML into Cheerio
    const $ = cheerio.load(html);

    // Find the table using the provided CSS path
    const table = $(tableCssPath);

    // Extract headers
    const headers: string[] = [];
    table
      .find('tr')
      .first()
      .find('th')
      .each((i, el) => {
        headers.push($(el).text().trim());
      });

    // Extract rows
    const stocks: MarketSymbol[] = [];
    table
      .find('tr')
      .slice(1)
      .each((i, row) => {
        const cells = $(row).find('td');
        if (cells.length === headers.length) {
          const stock: MarketSymbol = {
            symbol: '',
            name: '',
          };
          cells.each((j, cell) => {
            // if this cell is the symbol cell, use the mapping to get the symbol
            if (headers[j] === mapping.symbolKey) {
              stock.symbol = $(cell).text().trim();
            }
            // if this cell is the name cell, use the mapping to get the name
            if (headers[j] === mapping.nameKey) {
              stock.name = $(cell).text().trim();
            }
          });
          console.log(`Extracted stock: ${stock.symbol} - ${stock.name}`);
          stocks.push(stock);
        }
      });

    //this.dataSource.getRepository(LogEntry).save({
    //  level: 'info',
    //  message: `Found ${stocks.length} stocks in the table.`,
    //  context: 'getStocksFromWikipedia',
    //});

    return stocks;
  } catch (err) {
    console.error('Failed to fetch or parse Wikipedia:', err.message);
    return [];
  }
}

/*

 Todo:
 - update the updated/created date of the stocks when fetching them
 - if the interval or enabled properties of the cron are changed, kill the existing interval and create a new one
 - getDashboard (Finish this)
 - getForecast (Finish this)
 - Update website to use the new API endpoints

*/
