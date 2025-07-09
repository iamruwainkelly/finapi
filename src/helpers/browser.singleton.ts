import { BrowserContext, chromium, Page } from 'patchright';

let browser: BrowserContext | null = null;

export async function newPage(): Promise<Page> {
  try {
    browser = await getBrowser();
    return await browser.newPage();
  } catch (error) {
    // If the error is related to the browser being closed, try to reopen it
    if (
      error.message.includes('Target page, context or browser has been closed')
    ) {
      browser = null;
      browser = await getBrowser();
      return await browser.newPage();
    }

    // If the error is not related to the browser being closed, rethrow it
    throw error;
  }
}

async function launchBrowser() {
  return await chromium.launchPersistentContext('./browser', {
    channel: 'chrome',
    headless: false,
    viewport: null,
  });
}

export async function getBrowser(): Promise<BrowserContext> {
  if (!browser) browser = await launchBrowser();
  return browser;
}

export async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
  }
}
