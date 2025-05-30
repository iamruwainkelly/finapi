export interface GainersAndLosers {
  gainers: IndexMover[];
  losers: IndexMover[];
}

export interface IndexMover {
  mobx_easy_id: string;
  month: string;
  instrumentId: number;
  flag: Flag;
  name: Name;
  precision: Precision;
  symbol: string;
  exchange: string;
  volume: string;
  last: string;
  change: string;
  changePercent: string;
  changeDirection: string;
  avgVolume: string;
  _liveVolume: number;
}

export interface Flag {
  name: string;
  code: string;
}

export interface Name {
  label: string;
  title: string;
  derived: boolean;
  url: string;
}

export interface Precision {
  change: number;
  changePercent: number;
}
