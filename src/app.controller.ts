import { Controller, Get, Param, Query } from '@nestjs/common';
import { AppService } from './app.service';
import yahooFinance from 'yahoo-finance2';
import { chromium, LaunchOptions } from 'playwright';
import * as cheerio from 'cheerio';
import * as fs from 'node:fs';
import { ApiExcludeController, ApiExcludeEndpoint } from '@nestjs/swagger';

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

  console.log('date', date);

  // declare todays date
  const today = new Date();

  // find an entry in newResults, where the datestring is equal to dtString
  let lookupEntry = historic.find(
    (result) => result.dateString === date.toISOString().split('T')[0],
  );

  console.log('date-lookup1.1', lookupEntry);

  // if the entry is not found, starting from the end of the array, find the first entry where the dateTicks is less than dt
  if (!lookupEntry) {
    for (let i = historic.length - 1; i >= 0; i--) {
      if (historic[i].dateTicks < date.getTime() / 1000) {
        lookupEntry = historic[i];
        break;
      }
    }
  }

  console.log('date-lookup1.2', lookupEntry);

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
  headless: false,
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
  constructor(private readonly appService: AppService) {}

  @ApiExcludeEndpoint()
  @Get('/')
  get(): string {
    return this.appService.getHello();
  }

  @Get('quote/:symbol')
  async quote(@Param() params: any): Promise<object> {
    console.log('symbol', params.symbol);

    const results = await yahooFinance.quote(params.symbol);

    //results[0].

    return results;
  }

  @Get('gainers/:symbol')
  async gainers(@Param() params: any): Promise<object> {
    console.log('symbol', params.symbol);

    const results = await yahooFinance.dailyGainers(params.symbol);

    //results[0].

    return results;
  }

  @Get('quotes')
  async quotes(@Query('symbols') symbols: string): Promise<object> {
    const symbolArray = symbols.split(',');

    const results = await yahooFinance.quote(symbolArray, {
      fields: [
        'symbol',
        'longName',
        'regularMarketPrice',
        'regularMarketChange',
        'regularMarketChangePercent',
        'regularMarketDayRange',
      ],
    });

    return results;
  }

  @Get('historical/:symbol')
  async historical(@Param() params: any): Promise<object> {
    console.log('symbol', params.symbol);

    // declare a date today
    const today = new Date();

    // declare a date, 4 months ago
    const fourMonthsAgo = new Date(today);
    fourMonthsAgo.setMonth(today.getMonth() - 4);

    const query = params.symbol;
    const queryOptions = { period1: fourMonthsAgo };
    const results: YahooHistoric[] = await yahooFinance.historical(
      query,
      queryOptions,
    );

    // console.log('results2', results2);
    // write the results to a file
    //fs.writeFileSync('data.json', JSON.stringify(results2, null, 2));
    // read the data.json file and parse it
    // const data = fs.readFileSync('./data.json', 'utf8');

    // read data.json file and parse it
    //const data = fs.readFileSync('./data.json', 'utf8');
    //const results: YahooHistoric[] = JSON.parse(data);

    // get index of the last entry in results
    const lastIndex = results.length - 1;
    const lastEntry = results[lastIndex];

    // get the entry, 5 entries before the last entry
    const fiveDayChangeEntry = results[lastIndex - 5];

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
    //threeMonthsAgo.setDate(today.getDate() - 90);

    console.log('threeMonthsAgo', threeMonthsAgo);

    // calculate the change between the last entry and the entry three months ago
    const threeMonthChange = calculateHistoricChangeByDate(
      results,
      threeMonthsAgo,
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

  @Get('search/:symbol')
  async search(@Param() params: any): Promise<object> {
    console.log('symbol', params.symbol);

    const results = await yahooFinance.search(params.symbol);

    return results;
  }

  @Get('market-movers/:index')
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

  // route for scra[ping a url
  @ApiExcludeEndpoint()
  @Get('scrape')
  async scrape(): Promise<object> {
    const url =
      // 'https://markets.businessinsider.com/index/market-movers/s&p_500';
      //'https://www.marketwatch.com/investing/index/sx5e?countryCode=XX';
      // https://www.barrons.com/market-data/indexes/sx5e?countrycode=xx
      //'https://www.barrons.com/market-data/indexes/sx5e?countrycode=xx';
      //'https://www.wsj.com/market-data/quotes/index/CH/XSWX/SMI';
      'https://www.investing.com/indices/eu-stoxx50';
    const browser = await chromium.launch(options);
    const context = await browser.newContext(contextOptions);
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    const content = await page.content();
    await browser.close();

    // save the content to a file
    fs.writeFileSync('investing-stoxx50.html', content);

    // load the content into cheerio
    const $ = cheerio.load(content);

    // extract json from script id="__NEXT_DATA__" tag
    const json = $('#__NEXT_DATA__').text();
    // parse the json and get the data from the props object
    const data = JSON.parse(json);

    return { content };
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
