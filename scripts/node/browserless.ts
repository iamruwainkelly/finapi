import * as fs from 'node:fs';
import * as dotenv from 'dotenv';

dotenv.config();

async function fetchBrowserQL() {
  const url = 'https://www.investing.com/indices/switzerland-20';

  const token = process.env.BROWSERLESS_API_KEY;
  if (!token) {
    throw new Error(
      'BROWSERLESS_API_KEY is not set in the environment variables.',
    );
  }
  const endpoint = process.env.BROWSERLESS_ENDPOINT_URL;
  if (!endpoint) {
    throw new Error(
      'BROWSERLESS_ENDPOINT_URL is not set in the environment variables.',
    );
  }

  const proxyString = '&proxy=residential&proxyCountry=us';
  const optionsString = '&humanlike=true&adBlock=true&blockConsentModals=true';
  const browserlessUrl = `${endpoint}?token=${token}${proxyString}${optionsString}`;

  const response = await fetch(browserlessUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `
      mutation GetContent($url: String!) {

        # to save bandwidth, you can use this reject function
        reject(type: [image, media, font, stylesheet]) {
            enabled
            time
        }      

        goto(url: $url, waitUntil: firstContentfulPaint) {
            status
        }

        # export cleaned HTML with numerous options
        html(clean: {
            # removeNonTextNodes: true
        }) {
            html
        }
      }
      `,
      variables: {
        url: url,
      },
    }),
  });

  const data = await response.json();

  // save json to  file
  const now = new Date();
  const dateStr = now.toISOString().replace(/[:.]/g, '-');
  const filename = `browserql_content_${dateStr}.json`;
  fs.writeFileSync(filename, JSON.stringify(data, null, 2), 'utf8');
}

fetchBrowserQL();
