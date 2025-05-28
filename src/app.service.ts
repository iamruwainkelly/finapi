import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Index } from './entities/index.entity';
// stock
import { Stock } from './entities/stock.entity'; // Assuming you have a Stock entity
import { DataSource, In, Repository } from 'typeorm';
import * as fs from 'node:fs';
import * as path from 'node:path';
import axios from 'axios';
import { parse } from 'csv-parse/sync';
import { SymbolMapping } from './typings/SymbolMapping';
import { MarketIndex } from './typings/MarketIndex';
import { MarketSymbol } from './typings/MarketSymbol';

import { DOMParser } from 'xmldom';
import * as xpath from 'xpath';
import * as cheerio from 'cheerio';
import { Stoxx } from './typings/Stoxx';
import e from 'express';
import yahooFinance from 'yahoo-finance2';
import { Quote } from './entities/quote.entity';
import { IndexQuote } from './typings/IndexQuote';
import { Cron } from './entities/cron.entity';
import { Setting } from './entities/setting.entity';

@Injectable()
export class AppService implements OnModuleInit {
  constructor(
    // @InjectRepository(Index)
    private dataSource: DataSource,
  ) {}

  runCron = async (cron: Cron) => {
    // execute the task based on the cronName and methodName
    // execute the method dynamically
    const method = (this as any)[cron.method];
    if (typeof method === 'function') {
      console.log(`Running cron: ${cron.name} with method: ${cron.method}`);
      await method.call(this);
    } else {
      console.error(`Method ${cron.method} not found for cron: ${cron.name}`);
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
      console.log(
        'Settings table already initialized. No new settings to create.',
      );
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
    console.log('Index table checked and initialized (if needed).');
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
        console.log(
          `Stocks for index ${jsonIndex.yahooFinanceSymbol} already exist in the database. Skipping.`,
        );
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
        console.error(
          `Index ${jsonIndex.yahooFinanceSymbol} not found in the database. Skipping.`,
        );
        continue;
      }

      const stockEntities = stocks.map((stock) => {
        const stockEntity = new Stock(); // Assuming you have a Stock entity
        stockEntity.symbol = stock.symbol;
        stockEntity.name = stock.name;
        stockEntity.index = index; // Set the index relation
        stockEntity.created = new Date().getTime();

        return stockEntity;
      });

      await stockRepository.save(stockEntities);
      console.log(
        `Stocks for index ${jsonIndex.yahooFinanceSymbol} saved successfully.`,
      );
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
      console.log('Cron jobs already initialized. No new crons to create.');
      return;
    }

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

    // find all crons in the database whose enabled is true
    const crons = await cronRepository.find({
      where: { enabled: true },
      order: { id: 'ASC' }, // Order by id ascending
    });

    // loop througheach crons and add run with setInterval and runTask
    const cronTasks = crons.map((cron) => {
      // Run the task immediately
      // this.runCron(cron);

      // Set an interval to run the task every cron.interval minutes
      setInterval(
        async () => {
          console.log(`Running scheduled task: ${cron.name}`);
          await this.runCron(cron);
        },
        cron.interval * 60 * 1000,
      ); // Convert minutes to milliseconds

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
      const fiveMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
      for (const quote of existingQuotes) {
        const lastCreated = new Date(quote.created);
        if (lastCreated < fiveMinutesAgo) {
          refetch = true;
          break;
        }
      }
    }

    // if we need to refetch quotes, delete all quotes for these indexes
    if (refetch) {
      await this.dataSource
        .getRepository(Quote)
        .createQueryBuilder('quote')
        .delete()
        .where('quote.symbol IN (:...symbols)', {
          symbols: indexes.map((index) => index.symbol),
        })
        .execute();

      console.log(
        'Refetching quotes for indexes:',
        indexes.map((i) => i.symbol),
      );

      // perform a quoteCombine for each index
      await Promise.all(
        indexes.map(async (index) => {
          const result = await yahooFinance.quoteCombine(index.symbol, {
            fields: [
              'regularMarketPrice',
              'regularMarketChangePercent',
              'longName',
              'regularMarketPreviousClose',
              'quoteType',
              'averageDailyVolume10Day',
            ],
          });

          // save the result to the database
          const quote = new Quote();
          quote.symbol = index.symbol;
          quote.json = result;
          quote.created = new Date().getTime();
          await this.dataSource.getRepository(Quote).save(quote);
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

  async onModuleInit() {
    // await this.initializeSettingsData();
    await this.initializeIndexData();
    await this.initializeIndexStockData();

    await this.initializeCronJobs();
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
    console.log('Fetching data from Wikipedia:', url);

    // Fetch the HTML content from the URL
    const response = await axios.get(url);
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

    console.log(`Found ${stocks.length} stocks in the table.`);

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
