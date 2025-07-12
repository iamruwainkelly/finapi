// export interface MarketMover {
//   symbol: string;
//   name?: string;
//   volume?: number;
//   avgVolume?: number;
//   change?: number;
//   changeDirection?: string;
//   changePercent: string;
//   price: number;
//   [key: string]: any;
// }

/*
  {
    "mobx_easy_id": "_av4uy9ese",
    "month": "",
    "instrumentId": 332,
    "flag": {
      "name": "Novartis",
      "code": "CH"
    },
    "name": {
      "label": "Novartis",
      "title": "Novartis AG",
      "derived": false,
      "url": "/equities/novartis"
    },
    "precision": {
      "change": 2,
      "changePercent": 2
    },
    "symbol": "NOVN",
    "exchange": "Switzerland",
    "volume": "3026367",
    "last": "96.23",
    "change": "-2.98",
    "changePercent": "-3.00",
    "changeDirection": "Down",
    "avgVolume": "3252580",
    "_liveVolume": 3026367
  },
*/

export interface MarketMover {
  mobx_easy_id?: string;
  month?: string;
  instrumentId?: number;
  flag?: {
    name?: string;
    code?: string;
  };
  name?: {
    label?: string;
    title?: string;
    derived?: boolean;
    url?: string;
  };
  precision?: {
    change?: number;
    changePercent?: number;
  };
  symbol?: string;
  exchange?: string;
  volume?: string;
  last?: string;
  change?: string;
  changePercent?: string;
  changeDirection?: string;
  avgVolume?: string;
  _liveVolume?: number;
}
