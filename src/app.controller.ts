import { Controller, Get, Param, Query, UseInterceptors } from '@nestjs/common';
import { AppService } from './app.service';
import yahooFinance from 'yahoo-finance2';
import { chromium, LaunchOptions } from 'playwright';
import * as cheerio from 'cheerio';
import * as fs from 'node:fs';
import { ApiExcludeController, ApiExcludeEndpoint } from '@nestjs/swagger';
import { CacheInterceptor, CacheModule } from '@nestjs/cache-manager';
import { Quote } from './entities/quote.entity';
import { DataSource } from 'typeorm';
import e from 'express';

interface YahooHistoric {
  adjClose?: number | undefined;
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface Historic {
  adjClose?: number | undefined;
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  dateString?: string | undefined;
  dateTicks: number;
}

// create a function to calculate the change in price between two dates
// and return the change in price and the change in percent
const calculateChange = (currentPrice: number, previousPrice: number) => {
  const change = currentPrice - previousPrice;
  const changePercent = (change / previousPrice) * 100;

  return { change, changePercent };
};

// function to calculate the change given a Historic object array and a date string
const calculateHistoricChangeByDate = (
  yahooHistoric: YahooHistoric[],
  date: Date,
) => {
  // create new object array with same fields as results and add dateTicks and dateString properties
  const historic: Historic[] = yahooHistoric.map((result: YahooHistoric) => {
    return {
      adjClose: result.adjClose,
      date: result.date,
      open: result.open,
      high: result.high,
      low: result.low,
      close: result.close,
      volume: result.volume,
      dateTicks: new Date(result.date).getTime() / 1000,
      dateString: new Date(result.date).toISOString().split('T')[0],
    };
  });

  // console.log('date', date);

  // declare todays date
  const today = new Date();

  // find an entry in newResults, where the datestring is equal to dtString
  let lookupEntry = historic.find(
    (result) => result.dateString === date.toISOString().split('T')[0],
  );

  // console.log('date-lookup1.1', lookupEntry);

  // if the entry is not found, starting from the end of the array, find the first entry where the dateTicks is less than dt
  if (!lookupEntry) {
    for (let i = historic.length - 1; i >= 0; i--) {
      if (historic[i].dateTicks < date.getTime() / 1000) {
        lookupEntry = historic[i];
        break;
      }
    }
  }

  // console.log('date-lookup1.2', lookupEntry);

  // get the last entry in the array
  const lastEntry = historic[historic.length - 1];

  // find the change between the last entry in historic and the lookupEntry
  const change = calculateChange(lastEntry.close, lookupEntry?.close ?? 0);

  return {
    change: change.change,
    changePercent: change.changePercent,
  };
};

const baseUrls = {
  investing: 'https://za.investing.com/indices/',
  yahooFinance: 'https://finance.yahoo.com/',
};

const indexes = [
  {
    yahooFinanceSymbol: '^GSPC',
    investingSymbol: 'SPX',
    investingUrlName: 'us-spx-500',
  },
  {
    yahooFinanceSymbol: '^IXIC',
    investingSymbol: 'IXIC',
    investingUrlName: 'nasdaq-composite',
  },
  {
    yahooFinanceSymbol: '^STOXX50E',
    investingSymbol: 'STOXX50E',
    investingUrlName: 'eu-stoxx50',
  },
  {
    yahooFinanceSymbol: '^SSMI',
    investingSymbol: 'SMI',
    investingUrlName: 'switzerland-20',
  },
];

// launch options for Playwright
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

@Controller('api/')
export class AppController {
  constructor(
    private readonly appService: AppService,
    private dataSource: DataSource,
  ) {}

  @ApiExcludeEndpoint()
  @Get('/test')
  async get(): Promise<string> {
    // get single record from the database, where symbol is ^GSPC
    const quote = await this.dataSource
      .getRepository(Quote)
      .findOneBy({ symbol: '^GSPC' });

    // if the record does not exist, create it
    if (!quote) {
      const newQuote = new Quote();
      newQuote.symbol = '^GSPC';
      newQuote.json = await yahooFinance.quote('^GSPC');
      await this.dataSource.getRepository(Quote).save(newQuote);
      return newQuote.json;
    }

    // if the record exists, check if it is older than 1 minute
    const now = new Date();
    const lastUpdated = new Date(quote.updated);
    const diff = Math.abs(now.getTime() - lastUpdated.getTime());
    const diffMinutes = Math.ceil(diff / (1000 * 60));

    // if the record is older than 1 minute, update it
    if (diffMinutes > 1) {
      quote.json = await yahooFinance.quote('^GSPC');
      quote.updated = Date.now();
      await this.dataSource.getRepository(Quote).save(quote);
    }

    return quote.json;
  }

  @UseInterceptors(CacheInterceptor)
  @Get('quote/:symbol')
  async quote(@Param() params: any): Promise<object> {
    // get single record from the database, where symbol is ^GSPC
    const quote = await this.dataSource
      .getRepository(Quote)
      .findOneBy({ symbol: params.symbol });

    // if the record does not exist, create it
    if (!quote) {
      const newQuote = new Quote();
      newQuote.symbol = params.symbol;
      newQuote.json = await yahooFinance.quote(params.symbol);
      await this.dataSource.getRepository(Quote).save(newQuote);
      return newQuote.json;
    }

    // if the record exists, check if it is older than 1 minute
    const now = new Date();
    const lastUpdated = new Date(quote.updated);
    const diff = Math.abs(now.getTime() - lastUpdated.getTime());
    const diffMinutes = Math.ceil(diff / (1000 * 60));

    // if the record is older than 1 minute, update it
    if (diffMinutes > 1) {
      quote.json = await yahooFinance.quote(params.symbol);
      quote.updated = Date.now();
      await this.dataSource.getRepository(Quote).save(quote);
    }

    return quote.json;
  }

  @Get('gainers/:symbol')
  async gainers(@Param() params: any): Promise<object> {
    // console.log('symbol', params.symbol);

    const results = await yahooFinance.dailyGainers(params.symbol);

    //results[0].

    return results;
  }

  getStockData = async (symbol: string) => {
    try {
      const result = await yahooFinance.quoteCombine(symbol, {
        fields: [
          'regularMarketPrice',
          'regularMarketChangePercent',
          'longName',
          'regularMarketPreviousClose',
          'quoteType',
          'averageDailyVolume10Day',
        ],
      });
      console.log(result);
      return result;
    } catch (error) {
      console.error('Error fetching stock data:', error);
    }
  };

  @Get('quotes')
  async quotes(@Query('symbols') symbols: string): Promise<object> {
    const symbolArray = symbols.split(',');

    // comma separated string to array

    //return {
    //   symbols: symbols,
    // };

    //const results = await yahooFinance.quoteCombine(['^GSPC', '^IXIC'], {
    // fields: [
    //   'symbol',
    //   'longName',
    //   'regularMarketPrice',
    //   'regularMarketChange',
    //   'regularMarketChangePercent',
    //   'regularMarketDayRange',
    // ],
    //});

    // loop through the symbolz and call the getStockData function
    const results = await Promise.all(
      symbolArray.map(async (symbol) => {
        const result = await yahooFinance.quoteCombine(symbol);
        return result;
      }),
    );

    return results;
  }

  // @UseInterceptors(CacheInterceptor)
  @Get('historical/:symbol')
  async historical(@Param() params: any): Promise<object> {
    // declare a date today
    const today = new Date();

    // declare a date, 13 months ago
    const thirteenMonthsAgo = new Date(today);
    thirteenMonthsAgo.setMonth(today.getMonth() - 13);

    const query = params.symbol;
    const queryOptions = { period1: thirteenMonthsAgo };
    const results: YahooHistoric[] = await yahooFinance.historical(
      query,
      queryOptions,
    );

    // get index of the last entry in results
    const lastIndex = results.length - 1;
    const lastEntry = results[lastIndex];

    // get the entry, 5 entries before the last entry
    const fiveDayChangeEntry = results[lastIndex - 5];
    // get the entry, 30 entries before the last entry
    const thirtyDayChangeEntry = results[lastIndex - 30];
    // get the entry, 60 entries before the last entry
    const sixtyDayChangeEntry = results[lastIndex - 60];

    // calculate the change between the last entry and the entry 5 days ago
    const fiveDayChange = calculateChange(
      lastEntry.close,
      fiveDayChangeEntry.close ?? 0,
    );

    // get the date, one month ago
    const oneMonthAgo = new Date(today);
    oneMonthAgo.setDate(today.getDate() - 30);

    // calculate the change between the last entry and the entry one month ago
    const oneMonthChange = calculateHistoricChangeByDate(results, oneMonthAgo);

    // declare a date threeMonthsAgo
    const threeMonthsAgo = new Date(today);
    threeMonthsAgo.setMonth(today.getMonth() - 3);

    // calculate the change between the last entry and the entry three months ago
    const threeMonthChange = calculateHistoricChangeByDate(
      results,
      threeMonthsAgo,
    );

    // sixMonthChange
    const sixMonthChange = calculateHistoricChangeByDate(
      results,
      new Date(today.setMonth(today.getMonth() - 6)),
    );

    // oneYearChange
    const oneYearChange = calculateHistoricChangeByDate(
      results,
      new Date(today.setFullYear(today.getFullYear() - 1)),
    );

    return {
      symbol: params.symbol,
      lastPrice: lastEntry.close,
      lastPriceDate: lastEntry.date,
      performance: {
        fiveDay: {
          change: fiveDayChange.change,
          changePercent: fiveDayChange.changePercent,
        },
        oneMonth: {
          change: oneMonthChange.change,
          changePercent: oneMonthChange.changePercent,
        },
        threeMonths: {
          change: threeMonthChange.change,
          changePercent: threeMonthChange.changePercent,
        },
        sixMonths: {
          change: sixMonthChange.change,
          changePercent: sixMonthChange.changePercent,
        },
        oneYear: {
          change: oneYearChange.change,
          changePercent: oneYearChange.changePercent,
        },
      },
    };
  }

  // quoteSummary
  @Get('quote-summary/:symbol')
  async quoteSummary(@Param() params: any): Promise<object> {
    console.log('symbol', params.symbol);

    // const results = await yahooFinance.quoteSummary(params.symbol, {
    //   modules: ['financialData', 'summaryDetail'],
    // });
    const results = await yahooFinance.quoteSummary(params.symbol);

    // results.

    return results;
  }

  @UseInterceptors(CacheInterceptor)
  @Get('search/:symbol')
  async search(@Param() params: any): Promise<object> {
    console.log('symbol', params.symbol);

    const results = await yahooFinance.search(params.symbol);

    return results;
  }

  @UseInterceptors(CacheInterceptor)
  @Get('dashboard/:symbol')
  async dashboardSymbol(@Param() params: any): Promise<object> {
    const quote = await this.quote(params);
    const historical = await this.historical(params);
    const search = await this.search(params);
    const marketMovers = await this.marketMovers(params);

    return {
      quote: quote,
      historical: historical,
      search: search,
      marketMovers: marketMovers,
    };
  }

  @UseInterceptors(CacheInterceptor)
  @Get('dashboard')
  async dashboard(): Promise<Array<object>> {
    // get the indexes from the indexes array
    const indexSymbols = indexes.map((index) => index.yahooFinanceSymbol);

    // run all 4 functions in parallel
    const promises = indexSymbols.map(async (symbol) => {
      const quote = await this.quote({ symbol });
      const historical = await this.historical({ symbol });
      const search = await this.search({ symbol });
      const marketMovers = await this.marketMovers({ symbol });

      return {
        symbol: symbol,
        quote: quote,
        historical: historical,
        search: search,
        marketMovers: marketMovers,
      };
    });

    // wait for all promises to resolve
    const results = await Promise.all(promises);

    return results;
  }

  @Get('market-movers-1/:index')
  async marketwatch(@Param() params: any): Promise<object> {
    // throw an error if they did not prefix the index with ^
    if (!params.index.startsWith('^')) {
      return {
        error:
          'Index should be prefixed with ^. Index should be one of the following: ^GSPC, ^IXIC, ^STOXX50E, ^SSMI',
      };
    }

    //get the index from the indexes array
    const index = indexes.find(
      (index) => index.yahooFinanceSymbol === params.index.toUpperCase(),
    );

    if (!index) {
      return {
        error:
          'Index not found. Index should be one of the following: ^GSPC, ^IXIC, ^STOXX50E, ^SSMI',
      };
    }

    const url = `https://za.investing.com/indices/${index.investingUrlName}`;

    const browser = await chromium.launch(options);

    const context = await browser.newContext(contextOptions);

    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    const content = await page.content();
    await browser.close();

    const $ = cheerio.load(content);

    // Extract "Top Gainers" data
    const gainersTable = $('[data-test="gainers-table"] tbody tr');
    const gainers = gainersTable
      .map((_, row) => {
        const cells = $(row).find('td');
        return {
          name: $(cells[0])
            .find('[data-test="gainers-losers-label"]')
            .text()
            .trim(),
          symbol: $(cells[0]).find('span.font-semibold').text().trim(),
          price: $(cells[1])
            .find('[data-test="gainers-losers-last"]')
            .text()
            .trim(),
          change: $(cells[1])
            .find('[data-test="gainers-losers-change"] span.font-normal')
            .text()
            .trim(),
          changePercent: $(cells[1])
            .find('[data-test="gainers-losers-change"] span.font-semibold')
            .text()
            .trim(),
        };
      })
      .get();

    // Extract "Top Losers" data
    const losersTable = $('[data-test="losers-table"] tbody tr');
    const losers = losersTable
      .map((_, row) => {
        const cells = $(row).find('td');
        return {
          name: $(cells[0])
            .find('[data-test="gainers-losers-label"]')
            .text()
            .trim(),
          symbol: $(cells[0]).find('span.font-semibold').text().trim(),
          price: $(cells[1])
            .find('[data-test="gainers-losers-last"]')
            .text()
            .trim(),
          change: $(cells[1])
            .find('[data-test="gainers-losers-change"] span.font-normal')
            .text()
            .trim(),
          changePercent: $(cells[1])
            .find('[data-test="gainers-losers-change"] span.font-semibold')
            .text()
            .trim(),
        };
      })
      .get();

    return { gainers, losers };
  }

  @UseInterceptors(CacheInterceptor)
  @ApiExcludeEndpoint()
  @Get('market-movers/:index')
  async marketMovers(@Param() params: any): Promise<object> {
    // get the index from the indexes array
    const index = indexes.find(
      (index) => index.yahooFinanceSymbol === params.symbol.toUpperCase(),
    );

    // if the index is not found, return an error
    if (!index) {
      return {
        error:
          'Index not found. Index should be one of the following: ^GSPC, ^IXIC, ^STOXX50E, ^SSMI',
      };
    }

    const url = `https://za.investing.com/indices/${index.investingUrlName}`;

    const browser = await chromium.launch(options);
    const context = await browser.newContext(contextOptions);
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    const content = await page.content();
    await browser.close();

    // save the content to a file
    fs.writeFileSync(`market-movers-${index?.investingSymbol}.html`, content);

    // load the content into cheerio
    const $ = cheerio.load(content);

    // extract json from script id="__NEXT_DATA__" tag
    const json = $('#__NEXT_DATA__').text();

    // parse the json and get the data from the props object
    const data = JSON.parse(json);

    // Access specific data, for example, pageProps
    const pageProps = data.props.pageProps.state.quotesStore.quotes;

    let losers = [];
    let gainers = [];

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
                losers = prop[1]._collection;
              } else if (item.startsWith('indexGainers')) {
                // get the next item in the array
                gainers = prop[1]._collection;
              }
            }

            break;
        }
      }
    }

    return { gainers, losers };
  }

  // route for scra[ping a url
  @ApiExcludeEndpoint()
  @Get('scrape')
  async scrape(): Promise<object> {
    const url =
      'https://superbalist.com/browse/men/shoes/sneakers?max_price=2000&page=3';
    const browser = await chromium.launch(options);
    const context = await browser.newContext(contextOptions);
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    const content = await page.content();
    await browser.close();

    // save the content to a file
    fs.writeFileSync('sneakers.html', content);

    return { content };
  }

  // route for scra[ping a url
  @UseInterceptors(CacheInterceptor)
  @ApiExcludeEndpoint()
  @Get('test')
  async test(): Promise<object> {
    // simulate waiting for 5 seconds
    await new Promise((resolve) => setTimeout(resolve, 3000));

    return { hello: 'world' };
  }
}

/*

- uses captcha:
https://www.marketwatch.com

# todo
 https://priceapi.moneycontrol.com/technicalCompanyData/usMarket/getTopLoser?index=SPX:IND&view=web&section=overview&deviceType=W
https://priceapi.moneycontrol.com/technicalCompanyData/usMarket/getTopGainer?index=SPX:IND&view=web&section=overview&deviceType=W

 https://priceapi.moneycontrol.com/technicalCompanyData/usMarket/getTopLoser?index=NDX:IND&view=web&section=overview&deviceType=W
https://priceapi.moneycontrol.com/technicalCompanyData/usMarket/getTopGainer?index=NDX:IND&view=web&section=overview&deviceType=W


- market movers
  - https://markets.businessinsider.com/index/market-movers/s&p_500
  - https://markets.businessinsider.com/index/market-movers/smi
  - https://markets.businessinsider.com/index/market-movers/euro_stoxx_50
  - https://markets.businessinsider.com/index/market-movers/nasdaq_composite (not working)
    - gets lots of symbols 10+, also shows 3m 6m and 1y performance
    - html scraping
  - https://gdsapi.cnbc.com/market-mover/groupMover/SP500/CHANGE_PCT/BOTH/12.json?source=SAVED&delayed=false&partnerId=2
    - has more than 5 symbols for top gainers and losers
    - json api


# captcha
https://www.wsj.com/market-data/quotes/index/XX/SX5P
https://www.wsj.com/market-data/quotes/index/US/SPX
https://www.wsj.com/market-data/quotes/index/US/COMP
https://www.wsj.com/market-data/quotes/index/CH/XSWX/SMI

# html scraping
https://www.investing.com/indices/switzerland-20
https://www.investing.com/indices/us-spx-500
https://www.investing.com/indices/nasdaq-composite
https://www.investing.com/indices/eu-stoxx50
*/
