import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { differenceInHours } from 'date-fns';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ScrapeService } from 'src/modules/scrape/scrape.service';
import { boolify, l } from 'src/utils/helpers';
import { MoreThan, Repository } from 'typeorm';
import { Index } from 'src/entities/index.entity';
import { getMarketMoverDatasourceFullFilePath } from 'src/constants';
import { MarketMover } from 'src/entities/marketMover.entity';
import { MarketMoverModel } from 'src/models/marketMover.model';
import * as cheerio from 'cheerio';
import currencyToFloat from 'currency-to-float';

@Injectable()
export class MarketMoverService {
  // configService and scrapeService are assumed to be injected
  constructor(
    @InjectRepository(Index)
    private indexRepository: Repository<Index>,
    @InjectRepository(MarketMover)
    private readonly marketMoverRepository: Repository<MarketMover>,
    private readonly configService: ConfigService,
    private readonly scrapeService: ScrapeService,
  ) {}

  parseTableX = ($: any, headerText: string) => {
    const result: MarketMoverModel[] = [];
    // Find the h2 with the headerText, then the next table
    $('h2').each((_: any, el: any) => {
      if ($(el).text().trim() === headerText) {
        const table = $(el).parent().next('div').find('table');
        table.find('tbody tr').each((_: any, row: any) => {
          const tds = $(row).find('td');
          const symbol = tds.eq(0).find('span').eq(1).text().trim();
          const name = tds.eq(0).find('div').eq(1).text().trim();
          const price = tds.eq(1).find('span').eq(0).text().trim();
          const priceChange = tds.eq(1).find('span').eq(1).text().trim();
          const priceChangePercent = tds.eq(1).find('span').eq(2).text().trim();

          const item: MarketMoverModel = {
            symbol,
            index: headerText,
            name,
            price,
            priceChange,
            priceChangePercent,
          };

          result.push(item);
        });
      }
    });
    return result;
  };

  parseTable($: any, tableSelector: string) {
    const result: MarketMoverModel[] = [];
    $(tableSelector)
      .find('tbody tr')
      .each((_: any, row: any) => {
        const td = $(row).find('td');
        const a = td.eq(0).find('a');
        const symbol = a.find('span').eq(1).text().trim();
        const name = a
          .find('div[data-test="gainers-losers-label"]')
          .text()
          .trim();
        const price = td
          .eq(1)
          .find('span[data-test="gainers-losers-last"]')
          .text()
          .trim();
        const priceChange = td
          .eq(1)
          .find('span[data-test="gainers-losers-change"] > span')
          .eq(0)
          .text()
          .trim();

        const priceChangePercent = td
          .eq(1)
          .find('span[data-test="gainers-losers-change"] > span')
          .eq(1)
          .text()
          .trim()
          // Remove the percent sign
          .replace('%', '');

        const item: MarketMoverModel = {
          index: '',
          symbol,
          name,
          price: currencyToFloat(price),
          priceChange,
          priceChangePercent,
        };
        result.push(item);
      });
    return result;
  }

  // fn to read filepath content and see if the file contains text "aiting for za.investing.com to respond"
  // if it does, download the source again
  async checkAndDownloadSource(symbol: string) {
    const fullFilePath = getMarketMoverDatasourceFullFilePath(symbol);

    if (fs.existsSync(fullFilePath)) {
      const content = fs.readFileSync(fullFilePath, 'utf-8');
      if (content.includes('Waiting for za.investing.com to respond')) {
        console.log(
          `File ${fullFilePath} contains error message. Downloading source again.`,
        );
        return await this.downloadSource(symbol);
      }
    }
  }

  async downloadSource(symbol: string) {
    // get the index from the database
    const index =
      (await this.indexRepository.findOne({ where: { symbol: symbol } })) ||
      new Index();

    // get file timestamp and only continue if news is older than 6 hours
    const fullFilePath = getMarketMoverDatasourceFullFilePath(index.symbol);

    if (fs.existsSync(fullFilePath)) {
      // check error message in file
      const content = fs.readFileSync(fullFilePath, 'utf-8');
      if (content.includes('Waiting for za.investing.com to respond')) {
        console.log(
          `File ${fullFilePath} contains error message. Downloading source again.`,
        );
        fs.unlinkSync(fullFilePath); // delete the file
        await this.downloadSource(symbol);
        return fullFilePath; // return the file path after downloading
      }

      // check if the file is less than 6 hours old
      const stats = fs.statSync(fullFilePath);
      const fileAgeInHours = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60);
      if (fileAgeInHours < 6) {
        console.log(
          `Skipping ${symbol} download as the file is less than 6 hours old.`,
        );

        return; // skip if the file is less than 6 hours old
      }
    }

    // fetch the investing page for the index
    const url = `https://za.investing.com/indices/${index.investingUrlName}`;

    const cloudScrapingEnabled = this.configService.get(
      'FINAPI_CLOUD_SCRAPING_ENABLED',
    );

    let content: string;
    if (boolify(cloudScrapingEnabled)) {
      content = await this.scrapeService.cloudScrape(url);
    } else {
      content = await this.scrapeService.localScrape(url);
    }

    // get filepath without file name and extension
    const folder = path.dirname(fullFilePath);

    // create the folder if it does not exist
    fs.mkdirSync(folder, { recursive: true });

    // write the content to a file
    fs.writeFileSync(fullFilePath, content);

    return fullFilePath;
  }

  async extractFromSource(symbol: string) {
    // get the index from the database
    const index =
      (await this.indexRepository.findOne({ where: { symbol: symbol } })) ||
      new Index();

    console.log(`Extracting market movers for index: ${index.symbol}`);

    // get file timestamp and only continue if news is older than 6 hours
    const filepath = getMarketMoverDatasourceFullFilePath(index.symbol);
    const content = fs.readFileSync(filepath, 'utf-8');

    console.log(filepath);

    // load the content into cheerio
    const $ = cheerio.load(content);

    // extract articles
    const gainers = this.parseTable($, '[data-test="gainers-table"] table');
    const losers = this.parseTable($, '[data-test="losers-table"] table');

    console.log(`Found ${gainers.length} gainers and ${losers.length} losers.`);

    // set index field
    gainers.forEach((item) => (item.index = index.symbol));
    losers.forEach((item) => (item.index = index.symbol));

    return [...gainers, ...losers];
  }

  get = async (marketIndex: string): Promise<MarketMover[]> => {
    const now = new Date();

    // capilize the marketIndex
    marketIndex = marketIndex.toUpperCase();

    // get items from the database
    // where nothing is older than 6 hours
    const timeThreshold = differenceInHours(
      now,
      Date.now() - 6 * 60 * 60 * 1000,
    ); // 6 hours in milliseconds
    const entityItems = await this.marketMoverRepository.find({
      where: { index: marketIndex, created: MoreThan(timeThreshold) },
    });

    // if no items found, try to fetch from investing.com
    if (entityItems.length === 0) {
      console.log(
        `No items found for index: ${marketIndex}. Fetching from Investing.com.`,
      );

      await this.downloadSource(marketIndex);
      await this.checkAndDownloadSource(marketIndex);
      const modelItems = await this.extractFromSource(marketIndex);

      console.log(
        `marketMover-get() - Found ${modelItems.length} items for index: ${marketIndex}.`,
      );

      // save the items to the database
      const entities = modelItems.map((item) => {
        const marketMover = new MarketMover();
        marketMover.symbol = item.symbol;
        marketMover.index = item.index;

        marketMover.name = item.name;
        marketMover.price = item.price;
        marketMover.priceChange = item.priceChange;
        marketMover.priceChangePercent = item.priceChangePercent;
        marketMover.created = now.getTime();
        marketMover.createdString = now.toISOString();
        marketMover.updated = now.getTime();
        marketMover.updatedString = now.toISOString();
        return marketMover;
      });

      // delete existing items for the index
      await this.marketMoverRepository.delete({ index: marketIndex });

      // save new items
      await this.marketMoverRepository.save(entities);

      l(
        `src/modules/market-mover/market-mover.service.ts`,
        `save`,
        `a - Found ${entities.length} items for index: ${marketIndex}.`,
      );

      // returning the newly saved items
      return await this.marketMoverRepository.find({
        where: { index: marketIndex, created: MoreThan(timeThreshold) },
      });
    }

    l(
      `src/modules/market-mover/market-mover.service.ts`,
      `get`,
      `b - Found ${entityItems.length} items for index: ${marketIndex}.`,
    );

    return entityItems;
  };
}
