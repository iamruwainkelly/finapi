export interface JsonMarketMover {
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
