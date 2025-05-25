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

@Injectable()
export class AppService implements OnModuleInit {
  constructor(
    // @InjectRepository(Index)
    private dataSource: DataSource,
  ) {}

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

        return stockEntity;
      });

      await stockRepository.save(stockEntities);
      console.log(
        `Stocks for index ${jsonIndex.yahooFinanceSymbol} saved successfully.`,
      );
    }
  };

  async onModuleInit() {
    await this.initializeIndexData();
    await this.initializeIndexStockData();
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
