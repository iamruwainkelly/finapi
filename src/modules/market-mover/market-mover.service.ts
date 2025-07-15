import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { differenceInHours } from 'date-fns';
import path from 'node:path';
import { ScrapeService } from 'src/modules/scrape/scrape.service';
import { boolify } from 'src/utils/helpers';
import { MoreThan, Repository } from 'typeorm';
import { Index } from 'src/entities/index.entity';
import { getMarketMoverDatasourceFullFilePath } from 'src/constants';
import { MarketMover } from 'src/entities/marketMover.entity';
import { MarketMoverModel } from 'src/models/marketMover.model';

@Injectable()
export class MarketMoverService {
  // configService and scrapeService are assumed to be injected
  constructor(
    @InjectRepository(Index)
    private indexRepository: Repository<Index>,
    private readonly marketMoverRepository: Repository<MarketMover>,
    private readonly configService: ConfigService,
    private readonly scrapeService: ScrapeService,
  ) {}

  parseTable = ($: any, headerText: string) => {
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
          const percentChange = tds.eq(1).find('span').eq(2).text().trim();

          const item: MarketMoverModel = {
            symbol,
            index: headerText,
            name,
            price,
            priceChange,
            percentChange,
          };

          result.push(item);
        });
      }
    });
    return result;
  };

  async downloadSource(symbol: string) {
    // get the index from the database
    const index =
      (await this.indexRepository.findOne({ where: { symbol: symbol } })) ||
      new Index();

    // get file timestamp and only continue if news is older than 6 hours
    const fullFilePath = getMarketMoverDatasourceFullFilePath(index.symbol);

    if (fs.existsSync(fullFilePath)) {
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

    // get file timestamp and only continue if news is older than 6 hours
    const filepath = getMarketMoverDatasourceFullFilePath(index.symbol);
    const content = fs.readFileSync(filepath, 'utf-8');

    // load the content into cheerio
    const $ = cheerio.load(content);

    // extract articles
    const gainers = this.parseTable($, 'Top Gainers');
    const losers = this.parseTable($, 'Top Losers');

    // set index field
    gainers.forEach((item) => (item.index = index.symbol));
    losers.forEach((item) => (item.index = index.symbol));

    return [...gainers, ...losers];
  }

  get = async (marketIndex: string): Promise<MarketMover[]> => {
    const now = new Date();

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
      const modelItems = await this.extractFromSource(marketIndex);

      // save the items to the database
      const entities = modelItems.map((item) => {
        const marketMover = new MarketMover();
        marketMover.symbol = item.symbol;
        marketMover.index = item.index;

        marketMover.name = item.name;
        marketMover.price = item.price;
        marketMover.priceChange = item.priceChange;
        marketMover.percentChange = item.percentChange;
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

      return await this.marketMoverRepository.find({
        where: { index: marketIndex, created: MoreThan(timeThreshold) },
      });
    }

    return entityItems;
  };
}
