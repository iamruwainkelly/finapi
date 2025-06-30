import { chromium } from 'patchright';
import * as fs from 'node:fs';

const fetch = async () => {
  const browser = await chromium.launchPersistentContext('./browser', {
    channel: 'chrome',
    headless: true, // set to true if you want to run in headless mode
    viewport: null,
  });

  let url = 'https://www.wsj.com/market-data/quotes/index/US/COMP';
  url = 'https://www.barrons.com/market-data/indexes/sx5e?countrycode=xx';
  url = 'https://www.marketwatch.com/investing/index/sx5e?countrycode=xx';

  const page = await browser.newPage();
  await page.goto(url, {
    waitUntil: 'domcontentloaded',
  });

  // get content
  const content = await page.content();

  // save html to file

  fs.writeFileSync('scrape.html', content);
  console.log('HTML content saved to scrape.html');
};

fetch()
  .then(() => console.log('Scraping completed successfully.'))
  .catch((error) => console.error('Error during scraping:', error));
