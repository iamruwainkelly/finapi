interface MarketMovers {
  gainers: MarketMover[];
  losers: MarketMover[];
}

import { Index } from './entities/index.entity';
// stock
import { Stock } from './entities/stock.entity';
import { DataSource, In } from 'typeorm';
import * as fs from 'node:fs';
import * as path from 'node:path';
import axios from 'axios';
import { parse } from 'csv-parse/sync';
import { SymbolMapping } from './typings/SymbolMapping';
import { MarketIndex } from './typings/MarketIndex';
import { MarketSymbol } from './typings/MarketSymbol';

import * as cheerio from 'cheerio';
import { Cron } from './entities/cron.entity';
import { Setting } from './entities/setting.entity';
import { Etf } from './entities/etf.entity';

import { getBrowser, closeBrowser } from './helpers/browser.singleton';
import { MarketMover as MarketMoverEntity } from './entities/marketMover.entity';

// MarketMover entity
import { MarketMover } from './typings/MarketMover';

import { News } from './entities/news.entity';

import { Logger as TypeOrmLogger } from 'typeorm';

import { LogEntry } from './entities/logentry.entity';

import {
  extractStocks,
  getTopMovers,
  parseTable,
} from './helpers/modules/movers';
import { Etf as EtfInterface } from './typings/Etf';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { parse as csvParse } from 'csv-parse';

import { HistoryModule } from './helpers/modules/history';
import { QuoteModule } from './helpers/modules/quote';
import { NewsService } from './helpers/modules/news.service';
import { YahooQuoteMinimal } from './typings/YahooQuote';

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
  constructor(
    private dataSource: DataSource,
    private historyModule: HistoryModule,
    private quoteModule: QuoteModule,
  ) {}

  async getStocksFromCsv(
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
      // fs.writeFileSync(outputPath, JSON.stringify(symbols, null, 2));

      return symbols;
    } catch (err) {
      console.error(
        'getStocksFromCsv - Failed to fetch or parse CSV :',
        err.message,
      );
      return [];
    }
  }

  async getStocksFromWikipedia(
    url: string,
    tableCssPath: string,
    mapping: SymbolMapping,
  ): Promise<MarketSymbol[]> {
    try {
      // return [];

      // Fetch the HTML content from the URL
      const response = await axios.get(url).catch((error) => {
        console.error('Failed to fetch HTML content:', error.message);
        return { status: 500, data: '' };
      });

      const html = response.data;

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
            stocks.push(stock);
          }
        });

      return stocks;
    } catch (err) {
      console.error('Failed to fetch or parse Wikipedia:', err.message);
      return [];
    }
  }

  runCron = async (cron: Cron) => {
    // execute the task based on the cronName and methodName
    // execute the method dynamically
    const method = (this as any)[cron.method];
    if (typeof method === 'function') {
      await method.call(this);

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
      fs.readFileSync(path.join('./src', 'data', 'indexData.json'), 'utf-8'),
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
      index.reutersNewsUrl = data.reutersNewsUrl;
      index.created = new Date().getTime();

      return index;
    });

    await indexRepository.save(indicesToCreateEntities);
  };

  downloadInvestingPages = async () => {
    const indexes = await this.dataSource
      .getRepository(Index)
      .createQueryBuilder('index')
      .getMany();

    // loop through each index and fetch the market movers
    for (const index of indexes) {
      // `investing-com-${index.symbol.replaceAll('^', '')}.html`,

      // get file timestamp and only continue if news is older than 6 hours
      const fileName = `investing-com-${index.symbol.replaceAll('^', '')}`;

      // set html output path
      const outputHtmlPath = path.join('./output', 'pages', fileName + '.html');

      if (fs.existsSync(outputHtmlPath)) {
        const stats = fs.statSync(outputHtmlPath);
        const fileAgeInHours = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60);
        if (fileAgeInHours < 6) {
          console.log(
            `Skipping ${index.symbol} download as the file is less than 6 hours old.`,
          );
          continue; // Skip to the next index if the file is less than 6 hours old
        }
      }

      // fetch the investing page for the index
      const url = `https://za.investing.com/indices/${index.investingUrlName}`;
      const browser = await getBrowser();
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      const content = await page.content();
      await page.close();

      // save the content to a file for debugging purposes
      fs.mkdirSync(path.dirname(outputHtmlPath), { recursive: true });
      fs.writeFileSync(outputHtmlPath, content, 'utf-8');

      // pull json from the script tag with id "__NEXT_DATA__"
      const $ = cheerio.load(content);
      const json = $('#__NEXT_DATA__').text();
      const data = JSON.parse(json);

      // set json output path
      const outputJsonPath = path.join('./output', 'json', fileName + '.json');

      // ensure the output directory exists
      fs.mkdirSync(path.dirname(outputJsonPath), { recursive: true });
      fs.writeFileSync(outputJsonPath, JSON.stringify(data, null, 2));
    }
  };

  initializeIndexStockData = async () => {
    const IndexesJsonData: MarketIndex[] = JSON.parse(
      fs.readFileSync(path.join('./src', 'data', 'indexData.json'), 'utf-8'),
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
          stocks = await this.getStocksFromCsv(stockConfig.sourceUrl, mapping);

          break;
        }

        case 'wikipedia': {
          const mapping: SymbolMapping = {
            symbolKey: stockConfig.symbolKey,
            nameKey: stockConfig.nameKey,
          };

          // Fetch stocks from Wikipedia
          stocks = await this.getStocksFromWikipedia(
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

  initializeEtfData = async () => {
    try {
      const etfs: EtfInterface[] = [];

      // read csv from file ~/src/data/etfs.csv line by line
      // and do for each line:

      fs.createReadStream(path.join('./src', 'data', 'etfs.csv'), {
        encoding: 'utf-8',
      })
        .pipe(
          csvParse({
            columns: true,
            skip_empty_lines: true,
            trim: true,
          }),
        )
        .on('data', (row: EtfInterface) => {
          etfs.push(row);
        })
        .on('end', async () => {
          // loop through each ETF and save it to the database
          const etfRepository = this.dataSource.getRepository(Etf);
          for (const etfData of etfs) {
            // check if the ETF already exists in the database
            const existingEtf = await etfRepository.findOne({
              where: { symbol: etfData.symbol },
            });

            if (existingEtf) {
              this.dataSource.getRepository(LogEntry).save({
                level: 'info',
                message: `ETF ${etfData.symbol} already exists in the database. Skipping.`,
                context: 'initializeEtfData',
              });
              continue; // Skip to the next ETF if it already exists
            }

            // skip if the symbol is empty or contains spaces
            if (!etfData.symbol || /\s/.test(etfData.symbol)) continue;

            // skip if the symbol starts with ^
            if (etfData.symbol.startsWith('^')) continue;

            // skip if the symbol has a dot in it
            if (etfData.symbol.includes('.')) continue;

            // create a new ETF entity, same as the EtfInterface
            let etf = new Etf();
            etf.symbol = etfData.symbol;
            etf.name = etfData.name;
            etf.currency = etfData.currency;
            etf.summary = etfData.summary;
            etf.category_group = etfData.category_group;
            etf.category = etfData.category;
            etf.family = etfData.family;
            etf.exchange = etfData.exchange;

            // save the ETF to the database
            await etfRepository.save(etf);
          }
        })
        .on('error', (err) => {
          console.error('Error reading file:', err);
        });

      return etfs;
    } catch (err) {
      console.error(
        'initializeEtfData - Failed to fetch or parse CSV:',
        err.message,
      );
      return [];
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

    // use a foreach loop to iterate over the crons
    // run them one by one and not in parallel
    for (const cron of crons) {
      console.log(
        `Initializing cron job: ${cron.name} with method: ${cron.method}`,
      );

      // Run the task immediately
      await this.runCron(cron);

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

      // add 2 seconds delay before setting the interval
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  };

  async getIndexQuotes(): Promise<YahooQuoteMinimal[]> {
    // get all indexes from the database
    const indexes = await this.dataSource
      .getRepository(Index)
      .createQueryBuilder('index')
      .getMany();

    // loop each index and perform a quoteCombine for each index
    const quotes: YahooQuoteMinimal[] = [];

    for (const index of indexes) {
      // sleep for 3 seconds to avoid hitting the API too quickly
      await new Promise((resolve) => setTimeout(resolve, 3000));

      const quote = await this.quoteModule.quote(index.symbol);

      quotes.push(quote);
    }

    return quotes;
  }

  async getIndexHistory(): Promise<void> {
    // get all indexes from the database
    const indexes = await this.dataSource
      .getRepository(Index)
      .createQueryBuilder('index')
      .getMany();

    // loop through each index and fetch the history from the history table
    for (const index of indexes) {
      await this.historyModule.history(index.symbol);
    }
  }

  async getIndexGainersAndLosers(symbol: string): Promise<MarketMovers> {
    // get settings from the database
    const settingsRepository = this.dataSource.getRepository(Setting);
    const settings = await settingsRepository.find();

    let marketMovers = null;

    marketMovers = await this.getIndexGainersAndLosersFromFile(symbol);

    return marketMovers;
  }

  async getIndexGainersAndLosersPlaywright(
    symbol: string,
  ): Promise<MarketMovers> {
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

    const browser = await getBrowser();
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    const content = await page.content();
    await page.close();

    // sleep for 1.5 seconds to avoid hitting the API too quickly
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // save the content to a file for debugging purposes
    const outputPath = path.join(
      './output',
      `${index.symbol.replaceAll('^', '')}-gainers-and-losers-playwright.html`,
    );
    fs.writeFileSync(outputPath, content, 'utf-8');

    // load the content into cheerio
    const $ = cheerio.load(content);

    // extract json from script id="__NEXT_DATA__" tag
    const json = $('#__NEXT_DATA__').text();

    // parse the json and get the data from the props object
    const data = JSON.parse(json);

    const stocks = extractStocks(data);
    const gainers = getTopMovers(stocks, 'Up');
    const losers = getTopMovers(stocks, 'Down');

    // return the GainersAndLosers object
    return {
      gainers: gainers,
      losers: losers,
    };
  }

  async getIndexGainersAndLosersFromFile(
    symbol: string,
  ): Promise<MarketMovers> {
    // check if the index is valid
    const indexRepository = this.dataSource.getRepository(Index);
    const index = await indexRepository.findOne({
      where: { symbol: symbol },
    });

    if (!index) {
      throw new Error(`Index ${index} not found in the database.`);
    }

    const indexJsonFileName = path.join(
      './output',
      'json',
      `investing-com-${index.symbol.replaceAll('^', '')}.json`,
    );

    const json = fs.readFileSync(indexJsonFileName, 'utf-8');

    const data = JSON.parse(json);

    const stocks = extractStocks(data);
    const gainers = getTopMovers(stocks, 'Up');
    const losers = getTopMovers(stocks, 'Down');

    // return the GainersAndLosers object
    return {
      gainers: gainers,
      losers: losers,
    };
  }

  async getIndexGainersAndLosersBrowserless(
    symbol: string,
  ): Promise<MarketMovers> {
    // check if the index is valid
    const indexRepository = this.dataSource.getRepository(Index);
    const index = await indexRepository.findOne({
      where: { symbol: symbol },
    });

    if (!index) {
      throw new Error(`Index ${index} not found in the database.`);
    }

    // fetch the market movers from investing.com
    const endpoint =
      process.env.BROWSERLESS_ENDPOINT ||
      'https://production-sfo.browserless.io/chromium/bql';
    const token = process.env.BROWSERLESS_API_KEY;
    if (!token) {
      throw new Error('BROWSERLESS_API_KEY environment variable is not set.');
    }
    const url = `https://za.investing.com/indices/${index.investingUrlName}`;

    const proxyString = '&proxy=residential&proxyCountry=us';
    const optionsString =
      '&humanlike=true&adBlock=true&blockConsentModals=true';
    const browserlessUrl = `${endpoint}?token=${token}${proxyString}${optionsString}`;

    const response = await fetch(browserlessUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `
      mutation GetContent($url: String!) {

        # to save bandwidth, you can use this reject function
        reject(type: [image, media, font, stylesheet]) {
            enabled
            time
        }      

        goto(url: $url, waitUntil: firstContentfulPaint) {
            status
        }

        # export cleaned HTML with numerous options
        html(clean: {
            # removeNonTextNodes: true
        }) {
            html
        }
      }
      `,
        variables: {
          url: url,
        },
      }),
    });

    const responseJson = await response.json();

    // save the content to a file for debugging purposes
    const outputPath = path.join(
      './output',
      `${index.symbol.replaceAll('^', '')}-gainers-and-losers-browserless.json`,
    );
    fs.writeFileSync(outputPath, JSON.stringify(responseJson, null, 2), 'utf8');

    const htmlContent = responseJson.data.html.html;

    const gainers = parseTable(htmlContent, '[data-test="gainers-table"]');
    const losers = parseTable(htmlContent, '[data-test="losers-table"]');

    const marketMovers: MarketMovers = {
      gainers: gainers,
      losers: losers,
    };

    // return the GainersAndLosers object
    return marketMovers;
  }

  // create function 'getIndexMarketMovers' to get market-movers for each index
  async getIndexMarketMovers(): Promise<void> {
    // get all indexes from the database
    const indexes = await this.dataSource
      .getRepository(Index)
      .createQueryBuilder('index')
      .getMany();

    // loop through each index and fetch the market movers
    for (const index of indexes) {
      // check if the index has any market movers
      const marketMoverRepository =
        this.dataSource.getRepository(MarketMoverEntity);
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

      if (refetch) {
        const gainersAndLosers = await this.getIndexGainersAndLosers(
          index.symbol,
        );

        // delete all existing market movers for this index
        await marketMoverRepository.delete({ symbol: index.symbol });

        // save the market movers to the database
        // save the GainersAndLosers to the json field of the MarketMover entity
        const marketMover = new MarketMoverEntity();
        marketMover.symbol = index.symbol;
        marketMover.json = JSON.stringify(gainersAndLosers);
        marketMover.created = new Date().getTime();
        await marketMoverRepository.save(marketMover);
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
      // await this.newsModule.checkForUpdate(index.symbol);
      //await this.newsModule.updateEntities(index.symbol);
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
    await getBrowser();

    // create output directory if it doesn't exist
    const outputDir = path.join('./output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    await this.initializeSettingsData();
    await this.initializeIndexData();
    await this.downloadInvestingPages();
    await this.initializeIndexStockData();
    await this.initializeEtfData();
    await this.initializeCronJobs();
  }

  async onModuleDestroy() {
    await closeBrowser();
  }
}
