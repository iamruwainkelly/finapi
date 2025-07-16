import { ReutersNews } from 'src/typings/ReutersNews';
import { newPage } from '../../helpers/browser.singleton';
import * as cheerio from 'cheerio';
import { Index } from 'src/entities/index.entity';
import { News } from 'src/entities/news.entity';
import { NewsModel } from 'src/models/news.model';
import { differenceInHours, toDate } from 'date-fns';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { InvestingNews } from 'src/typings/InvestingNews';
import { Injectable } from '@nestjs/common';
import { In, MoreThan, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { AppService } from 'src/app.service';
import { ConfigService } from '@nestjs/config';
import { ScrapeService } from 'src/modules/scrape/scrape.service';
import { getNewsDatasourceFullFilePath } from 'src/constants';
import { boolify } from 'src/utils/helpers';

function getReutersNewsItems(index: Index): Promise<NewsModel[]> {
  return new Promise(async (resolve, reject) => {
    try {
      const page = await newPage();

      console.log('Fetching news from:', index.reutersNewsUrl);

      await page.goto(index.reutersNewsUrl, {
        waitUntil: 'domcontentloaded',
      });

      const content = await page.content();

      // write the content to a file for debugging purposes
      fs.writeFileSync(`${index.symbol}-reuters-news.html`, content);

      await page.close();

      // sleep for 1.5 seconds to avoid hitting the API too quickly
      await new Promise((resolve) => setTimeout(resolve, 1500));

      const $ = cheerio.load(content);

      const news: NewsModel[] = [];

      let reutersNews = {} as ReutersNews;
      $('script').each((_, el) => {
        const scriptText = $(el).html();
        if (scriptText && scriptText.includes('Fusion.globalContent')) {
          // Match: Fusion.globalContent = { ... };
          const match = scriptText.match(
            /Fusion\.globalContent\s*=\s*({.*?});/s,
          );
          if (match && match[1]) {
            reutersNews = JSON.parse(match[1]);
          }
        }
      });

      if (reutersNews) {
        // Extract news articles from the JSON
        reutersNews.result.articles.forEach((article) => {
          news.push({
            symbol: index.symbol,
            imageUrl: article.thumbnail.resizer_url,
            title: article.title,
            // if article.canonical_url starts with a /
            url: article.canonical_url.startsWith('/')
              ? `https://www.reuters.com${article.canonical_url}`
              : article.canonical_url,
            date: toDate(
              article.updated_time || article.published_time,
            ).getTime(),
            provider: article.distributor || 'Reuters',
          });
        });
      }

      resolve(news);
    } catch (error) {
      console.error('Error fetching news:', error);
      reject(error);
    }
  });
}

function extractNewsFromInvestingComJson(jsonData: any): NewsModel[] {
  const newsItems: NewsModel[] = [];

  const articles: InvestingNews[] =
    jsonData.props.pageProps.state.newsStore._topArticles;

  articles.forEach((article) => {
    // if href starts with a /
    // then prepend https://www.investing.com
    const url = article.href.startsWith('/')
      ? `https://www.investing.com${article.href}`
      : article.href;
    const date = article.date;

    newsItems.push({
      symbol: '',
      title: article.title,
      url: url,
      imageUrl: article.imageHref,
      date: toDate(date).getTime(),
      provider: article.provider,
    });
  });

  return newsItems;
}

const pullNextDataFromHtmlFile = async (
  htmlFilePath: string,
  fileName: string,
): Promise<void> => {
  // read the html file
  const content = fs.readFileSync(htmlFilePath, 'utf-8');

  // load the content into cheerio
  const $ = cheerio.load(content);

  // extract json from script id="__NEXT_DATA__" tag
  const json = $('#__NEXT_DATA__').text();

  // set json output path
  const outputJsonPath = path.join('./output', 'json', fileName + '.json');
  fs.mkdirSync(path.dirname(outputJsonPath), { recursive: true });
  fs.writeFileSync(outputJsonPath, json);
};

@Injectable()
export class NewsService {
  constructor(
    @InjectRepository(Index)
    private indexRepository: Repository<Index>,
    @InjectRepository(News)
    private newsRepository: Repository<News>,
    private configService: ConfigService,
    private scrapeService: ScrapeService,
  ) {}

  async downloadSource(symbol: string) {
    // get the index from the database
    const index =
      (await this.indexRepository.findOne({ where: { symbol: symbol } })) ||
      new Index();

    // get file timestamp and only continue if news is older than 6 hours
    const fullFilePath = getNewsDatasourceFullFilePath(index.symbol);

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
    const filepath = getNewsDatasourceFullFilePath(index.symbol);
    const content = fs.readFileSync(filepath, 'utf-8');

    // load the content into cheerio
    const $ = cheerio.load(content);

    // extract articles
    const items: NewsModel[] = [];

    // extract news items from the page
    $('ul[data-test="new-and-analysis-list"] li article').each((_, el) => {
      const titleEl = $(el).find('a[data-test="article-title-link"]');
      const title = titleEl.text().trim();
      const url = titleEl.attr('href') || '';
      const datetime =
        $(el).find('time[data-test="article-publish-date"]').attr('datetime') ||
        '';
      // Try provider from <a> or <span>
      let provider = $(el)
        .find('a[data-test="article-provider-link"]')
        .text()
        .trim();
      if (!provider) {
        provider = $(el)
          .find('span[data-test="news-provider-name"]')
          .text()
          .trim();
      }

      const item: NewsModel = {
        symbol: index.symbol,
        title,
        date: new Date(datetime).getTime(),
        url,
        provider,
      };

      items.push({ ...item });
    });

    return items;
  }

  get = async (symbol: string): Promise<News[]> => {
    const now = new Date();

    // get news items from the database
    // where nothing is older than 6 hours
    const timeThreshold = differenceInHours(
      now,
      Date.now() - 6 * 60 * 60 * 1000,
    ); // 6 hours in milliseconds
    const news = await this.newsRepository.find({
      where: { symbol, created: MoreThan(timeThreshold) },
      order: { created: 'DESC' },
      take: 10,
    });

    // if no news items found, try to fetch from investing.com
    if (news.length === 0) {
      console.log(
        `No news found for symbol: ${symbol}. Fetching from Investing.com.`,
      );

      await this.downloadSource(symbol);
      const items = await this.extractFromSource(symbol);

      // save the items to the database
      const newsEntities = items.map((item) => {
        const news = new News();
        news.symbol = symbol;
        news.title = item.title;
        news.url = item.url;
        news.imageUrl = item.imageUrl;
        news.date = item.date;
        news.provider = item.provider;
        news.created = now.getTime();
        news.createdString = now.toISOString();
        news.updated = now.getTime();
        news.updatedString = now.toISOString();
        return news;
      });

      await this.newsRepository.save(newsEntities);

      return this.newsRepository.find({
        where: { symbol },
        order: { created: 'DESC' },
        take: 10,
      });
    }

    return news;
  };
}
