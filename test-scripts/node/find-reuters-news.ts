const fs = require('fs');
const cheerio = require('cheerio');

//iife
(async () => {
  const html = fs.readFileSync('scrape.html', 'utf8');
  const $ = cheerio.load(html);

  const news: any[] = [];

  interface GlobalContent {
    result?: {
      articles?: any[];
      [key: string]: any;
    };
    [key: string]: any;
  }

  let json: any = {};
  $('script').each((_: any, el: any) => {
    const scriptText = $(el).html();
    if (scriptText && scriptText.includes('Fusion.globalContent')) {
      // Match: Fusion.globalContent = { ... };
      const match = scriptText.match(/Fusion\.globalContent\s*=\s*({.*?});/s);
      if (match && match[1]) {
        json = JSON.parse(match[1]);
      }
    }
  });

  if (json && json.result && Array.isArray(json.result.articles)) {
    console.log(json.result.articles.length);
  } else {
    console.log('No articles found or JSON not loaded.');
  }
})();
