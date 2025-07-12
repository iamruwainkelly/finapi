import fs from 'node:fs';

const data = JSON.parse(
  fs.readFileSync('output/json/investing-com-SSMI.json', 'utf8'),
);

const quotes = data.props.pageProps.state.quotesStore.quotes;

function getGainers() {
  const gainers = quotes.find(
    ([key]: any[]) =>
      key.startsWith('indexGainers') && key.endsWith('-stocks.gainersLosers'),
  );
  return gainers ? gainers[1]._collection : null;
}

function getLosers() {
  const losers = quotes.find(
    ([key]: any[]) =>
      key.startsWith('indexLosers') && key.endsWith('-stocks.gainersLosers'),
  );
  return losers ? losers[1]._collection : null;
}
