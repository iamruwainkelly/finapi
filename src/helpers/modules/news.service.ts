import { Article, NewsItem, ReutersNews } from 'src/typings/ReutersNews';
import { getBrowser, newPage } from '../browser.singleton';
import * as cheerio from 'cheerio';
import { Index } from 'src/entities/index.entity';
import { News } from 'src/entities/news.entity';
import { differenceInHours, toDate } from 'date-fns';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { InvestingNews } from 'src/typings/InvestingNews';
import { Injectable } from '@nestjs/common';
import { In, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';

export function getReutersNewsItems(index: Index): Promise<NewsItem[]> {
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

      const news: NewsItem[] = [];

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
            imageUrl: article.thumbnail.resizer_url,
            title: article.title,
            // if article.canonical_url starts with a /
            url: article.canonical_url.startsWith('/')
              ? `https://www.reuters.com${article.canonical_url}`
              : article.canonical_url,
            date: toDate(
              article.updated_time || article.published_time,
            ).getTime(),
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

export function extractNewsFromInvestingComJson(jsonData: any): NewsItem[] {
  const newsItems: NewsItem[] = [];

  const articles: InvestingNews[] =
    jsonData.props.pageProps.state.newsStore._topArticles;

  articles.forEach((article) => {
    const title = article.title;
    // if href starts with a /
    // then prepend https://www.investing.com
    const url = article.href.startsWith('/')
      ? `https://www.investing.com${article.href}`
      : article.href;
    const date = article.date;
    const imageUrl = article.imageHref;

    newsItems.push({
      title,
      url,
      date: toDate(date).getTime(),
      imageUrl: imageUrl,
    });
  });

  return newsItems;
}

@Injectable()
export class NewsService {
  constructor(
    @InjectRepository(Index)
    private indexRepository: Repository<Index>,
    @InjectRepository(News)
    private newsRepository: Repository<News>,
  ) {}

  getInvestingNewsItems(symbol: string): NewsItem[] {
    const fileName = path.join(
      './output',
      'json',
      `investing-com-${symbol.replaceAll('^', '')}.json`,
    );

    if (!fs.existsSync(fileName)) {
      console.error(
        `File ${fileName} does not exist. Please run checkForUpdate first.`,
      );
    }

    const content = fs.readFileSync(fileName, 'utf-8');
    const jsonData = JSON.parse(content);

    const newsItems = extractNewsFromInvestingComJson(jsonData);
    return newsItems;
  }

  async checkForUpdate(symbol: string): Promise<void> {
    try {
      const fileName = `investing-com-${symbol.replaceAll('^', '')}`;

      // set html output path
      const outputHtmlPath = path.join('./output', 'pages', fileName + '.html');

      if (fs.existsSync(outputHtmlPath)) {
        const stats = fs.statSync(outputHtmlPath);
        const fileAgeInHours = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60);
        if (fileAgeInHours < 6) {
          console.log(
            `Skipping ${symbol} as the file is less than 6 hours old.`,
          );
          return; // skip if the file is less than 6 hours old
        }
      }

      const index = await this.indexRepository.findOne({
        where: { symbol: symbol },
      });

      if (!index) {
        throw new Error(`Index with symbol ${symbol} not found.`);
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
    } catch (error) {
      console.error('Error downloading news source:', error);
    }
  }

  updateEntities = async (symbol: string): Promise<void> => {
    try {
      // read news from database
      const existingNews = await this.newsRepository.findOneBy({ symbol });

      const now = new Date();

      if (!existingNews) {
        // add news to db
        console.log(`No existing news found for symbol: ${symbol}`);

        const newsItems = this.getInvestingNewsItems(symbol);

        const newsEntities = newsItems.map((item) => {
          const news = new News();
          news.symbol = symbol;
          // news.json = JSON.stringify(item);
          news.title = item.title;
          news.url = item.url;
          news.imageUrl = item.imageUrl;
          news.date = item.date;
          news.created = now.getTime();
          news.createdString = now.toISOString();
          news.updated = now.getTime();
          news.updatedString = now.toISOString();
          return news;
        });

        await this.newsRepository.save(newsEntities);
      } else {
        const lastUpdated = existingNews.updated;

        const hoursSinceLastUpdate = differenceInHours(
          toDate(now),
          toDate(lastUpdated),
        );

        // if the last update was less than 6 hours ago, skip the update
        if (hoursSinceLastUpdate < 6) {
          console.log(
            `Skipping update for ${symbol} as it was last updated ${hoursSinceLastUpdate} hours ago.`,
          );
          return;
        } else {
          console.log(
            `Updating news for ${symbol} as it was last updated ${hoursSinceLastUpdate} hours ago.`,
          );

          // fetch new news items
          const newsItems = this.getInvestingNewsItems(symbol);

          const newsEntities = newsItems.map((item) => {
            const news = new News();
            news.symbol = symbol;
            news.title = item.title;
            news.url = item.url;
            news.imageUrl = item.imageUrl;
            news.date = item.date;
            news.updated = now.getTime();
            news.updatedString = now.toISOString();
            return news;
          });

          await this.newsRepository.save(newsEntities);
        }
      }
    } catch (error) {
      console.error('Error updating news entities:', error);
      throw new Error(`Failed to update news entities for symbol: ${symbol}`);
    }
  };

  news = async (symbol: string): Promise<NewsItem[]> => {
    // check for updates
    await this.checkForUpdate(symbol);

    // update entities
    await this.updateEntities(symbol);

    const newsItems = await this.newsRepository.findBy({ symbol });

    return newsItems;
  };
}
