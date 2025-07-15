import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getBrowser } from 'src/helpers/browser.singleton';
import { getByPath, setByPath } from 'dot-path-value';
import { boolify } from 'src/utils/helpers';
@Injectable()
export class ScrapeService {
  constructor(private configService: ConfigService) {}

  cloudScrape = async (url: string): Promise<string> => {
    console.log(`Scraping cloud...`);

    // endpoint
    const endpoint = this.configService.get('FINAPI_CLOUD_SCRAPING_ENDPOINT');
    // params
    const params = this.configService.get(
      'FINAPI_CLOUD_SCRAPING_ENDPOINT_PARAMS',
    );
    // api key
    const token = this.configService.get('FINAPI_CLOUD_SCRAPING_API_KEY');

    if (!token) {
      throw new Error(
        'FINAPI_CLOUD_SCRAPING_API_KEY environment variable is not set.',
      );
    }

    const endpointUrl = `${endpoint}?token=${token}${params}`;

    // get FINAPI_CLOUD_SCRAPING_USE_BROWSERLESS
    const useBrowserless = this.configService.get(
      'FINAPI_CLOUD_SCRAPING_USE_BROWSERLESS',
    );

    let body = {};
    let htmlJsonPath = '';
    // set up post body based on useBrowserless
    if (boolify(useBrowserless)) {
      // read graphql query from file
      const graphqlQuery = fs.readFileSync(
        path.join('src', 'data', 'browserless.graphql'),
        'utf8',
      );
      body = {
        query: graphqlQuery,
        variables: {
          url: url,
        },
      };
      htmlJsonPath = 'data.html.html';
    } else {
      body = {
        url: url,
      };
      htmlJsonPath = 'html';
    }

    const response = await fetch(endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const responseJson = await response.json();

    // write response to file for debugging
    // const outputHtmlPath = path.join('output', 'output.json');
    // fs.mkdirSync(path.dirname(outputHtmlPath), { recursive: true });
    // fs.writeFileSync(outputHtmlPath, responseJson, 'utf-8');

    const html = getByPath(responseJson, htmlJsonPath);

    return html;
  };

  localScrape = async (url: string): Promise<string> => {
    // log scraping locally
    console.log(`Scraping locally...`);

    const browser = await getBrowser();
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    const content = await page.content();
    await page.close();
    return content;
  };
}
