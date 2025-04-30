import { Controller, Get, Param } from "@nestjs/common";
import { AppService } from "./app.service";
import yahooFinance from "yahoo-finance2";
import { chromium, LaunchOptions } from "playwright";
import * as cheerio from "cheerio";
import * as fs from "node:fs";
import { ApiExcludeController, ApiExcludeEndpoint } from "@nestjs/swagger";

const baseUrls = {
  investing: "https://za.investing.com/indices/",
  yahooFinance: "https://finance.yahoo.com/",
};

const indexes = [
  {
    yahooFinanceSymbol: "^GSPC",
    investingSymbol: "SPX",
    investingUrlName: "us-spx-500",
  },
  {
    yahooFinanceSymbol: "^IXIC",
    investingSymbol: "IXIC",
    investingUrlName: "nasdaq-composite",
  },
  {
    yahooFinanceSymbol: "^STOXX50E",
    investingSymbol: "STOXX50E",
    investingUrlName: "eu-stoxx50",
  },
  {
    yahooFinanceSymbol: "^SSMI",
    investingSymbol: "SMI",
    investingUrlName: "switzerland-20",
  },
];

// launch options for Playwright
const options: LaunchOptions = {
  headless: true,
  slowMo: 100,
  // set some args to make playwright behave more like a real browser
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-web-security",
    "--disable-features=IsolateOrigins,site-per-process",
    "--allow-insecure-localhost",
  ],
  ignoreDefaultArgs: ["--enable-automation"],
};

// create an array of user agents
const userAgents = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3",
  "Mozilla/5.0 (Windows NT 10.0; WOW64; rv:55.0) Gecko/20100101 Firefox/55.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3",
];

const contextOptions = {
  viewport: { width: 1280, height: 800 },
  userAgent: userAgents[Math.floor(Math.random() * userAgents.length)],
  deviceScaleFactor: 1,
};

@Controller("api/")
export class AppController {
  constructor(private readonly appService: AppService) {}

  @ApiExcludeEndpoint()
  @Get("/")
  get(): string {
    return this.appService.getHello();
  }

  @Get("quote/:symbol")
  async quote(@Param() params: any): Promise<object> {
    console.log("symbol", params.symbol);

    const results = await yahooFinance.quote(params.symbol);

    //results[0].

    return results;
  }

  // quoteSummary
  @Get("quote-summary/:symbol")
  async quoteSummary(@Param() params: any): Promise<object> {
    console.log("symbol", params.symbol);

    // const results = await yahooFinance.quoteSummary(params.symbol, {
    //   modules: ['financialData', 'summaryDetail'],
    // });
    const results = await yahooFinance.quoteSummary(params.symbol);

    // results.

    return results;
  }

  @Get("search/:symbol")
  async search(@Param() params: any): Promise<object> {
    console.log("symbol", params.symbol);

    const results = await yahooFinance.search(params.symbol);

    return results;
  }

  @Get("market-movers/:index")
  async marketwatch(@Param() params: any): Promise<object> {
    // throw an error if they did not prefix the index with ^
    if (!params.index.startsWith("^")) {
      return {
        error:
          "Index should be prefixed with ^. Index should be one of the following: ^GSPC, ^IXIC, ^STOXX50E, ^SSMI",
      };
    }

    //get the index from the indexes array
    const index = indexes.find(
      (index) => index.yahooFinanceSymbol === params.index,
    );

    if (!index) {
      return {
        error:
          "Index not found. Index should be one of the following: ^GSPC, ^IXIC, ^STOXX50E, ^SSMI",
      };
    }

    const url = `https://za.investing.com/indices/${index.investingUrlName}`;

    const browser = await chromium.launch(options);

    const context = await browser.newContext(contextOptions);

    const page = await context.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded" });
    const content = await page.content();
    await browser.close();

    const $ = cheerio.load(content);

    // Extract "Top Gainers" data
    const gainersTable = $('[data-test="gainers-table"] tbody tr');
    const topGainers = gainersTable
      .map((_, row) => {
        const cells = $(row).find("td");
        return {
          name: $(cells[0])
            .find('[data-test="gainers-losers-label"]')
            .text()
            .trim(),
          symbol: $(cells[0]).find("span.font-semibold").text().trim(),
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
    const topLosers = losersTable
      .map((_, row) => {
        const cells = $(row).find("td");
        return {
          name: $(cells[0])
            .find('[data-test="gainers-losers-label"]')
            .text()
            .trim(),
          symbol: $(cells[0]).find("span.font-semibold").text().trim(),
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

    // Log the extracted data to the console
    //console.log('Top Losers:', topLosers);
    // Log the extracted data to the console
    //console.log('Top Gainers:', topGainers);

    return { topGainers, topLosers };
  }

  // route for scra[ping a url
  @ApiExcludeEndpoint()
  @Get("scrape")
  async scrape(): Promise<object> {
    const url =
      "https://markets.businessinsider.com/index/market-movers/s&p_500";
    const browser = await chromium.launch(options);
    const context = await browser.newContext(contextOptions);
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded" });
    const content = await page.content();
    await browser.close();

    // save the content to a file
    fs.writeFileSync("scrape.html", content);

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
    - gets lots of symbols 10+, also shows 3m 6m and 1y performance
    - html scraping
  - https://gdsapi.cnbc.com/market-mover/groupMover/SP500/CHANGE_PCT/BOTH/12.json?source=SAVED&delayed=false&partnerId=2
    - has more than 5 symbols for top gainers and losers
    - json api


*/
