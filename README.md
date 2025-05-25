## Todo

### Targets

370 mins = 6h, 10m

10:00
14:00 <- without charts
16:00 <- should be done with all

## tables

- index
  - name
  - symbol [GSPC, IXIC, STOXX50E, SSMI]
  - created
  - modified
  - investingSymbol
  - investingUrlName
- quote

  - index.id
  - (all other fields comes here)

- compare quote x 4 vs sing combined call
- see how fast these 2 compare
- psuedocode
  - app initialization...
    - populate index table if empty
  - /dashbaord
    - const var_indexes = get the list of Table:Indexes to work with, put in array
    - quote... logic
      - select from quotes table where quotes less than 5 mins ago
        - where index in [var_indexes]
    - historical
    - search
    - marketMovers

```js

/*

## tables

### quotes
### history
### history_verification


- table.settings
  - name (make unique)
  - value

// add defaults
setting.name  = quote.caching.time
setting.value = 5

*/

function indexQuotesCombineLookup(symbols) {
  // perform this
  indexQuoteResults = quoteCombine(symbols)
  // save to table
  database.save(indexQuoteResults);
}

function getDashboardData() {

  const quotes = getQuotes(indexes);
  const historical = getHistorical(indexes)
  const news = getNews(indexes)
  const marketMovers = getMarketMovers(indexes)

  foreach (i in indexes) {

    results.push({
      symbol: i.symbol,
      quote: quotes[i.symbol],
      historical: quotes[i.symbol],
      search: quotes[i.symbol],
      marketMovers: quotes[i.symbol],
    })

  }

}

function getQuotes(indexes) {

  const settings = table.settings

  const indexes = table.indexes;

  const results = null

  // loop over indexes

  const indexQuotes =
  select from quotes q,
  where indexes in [indexes.symbols]
  where q.modified older than {quote.caching.time};

  if (indexQuotes.length <> index.length) {
    // what are the indexe quotes to look up and retrieve
    const indexQuotesToLookup: [] =
      indexes_not_present_in_indexQuotes;
  }

  // perform a quote combine lookup of {indexQuotesToLookup}
    // perform this
    indexQuoteResults = quoteCombine(symbols)
    // save to table
    database.save(indexQuoteResults);

  // retrieve the db quotes again
  indexQuotes: [] =
  select from quotes q,
  where indexes in [indexes.symbols]
  where q.modified older than {quote.caching.time};

  return indexQuotes;
}

// now do historical
function getHistorical(indexSymbols) {
  // code needs to be here
}









```

```

## refactorings

-

- complete all fields for forecast page
- get ssmi news from alt source
- add prediction to chart

## back off, im busy

- !! buy good quality sound wireless earphones - temu
- !! also buy a band connecting these wireless earphones
- jetbrains ai edit mode, how to enable
- test jetbrains edit mode
- Uglies - 2024
- Time cut - 2024
- The constant gardener - 2005
- the matrix - 1999
```
