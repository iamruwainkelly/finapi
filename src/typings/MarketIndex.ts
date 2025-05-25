//import { SymbolMapping } from './SymbolMapping';

export interface StockConfig {
  sourceUrl: string;
  sourceType: 'csv' | 'wikipedia';
  tableCssPath: string;
  symbolKey: string;
  nameKey: string;
}

export interface MarketIndex {
  yahooFinanceSymbol: string;
  investingSymbol: string;
  investingUrlName: string;
  //stockListSourceUrl: string;
  //stockListSourceType: 'csv' | 'wikkipedia' | 'bussinessinsider';
  stockConfig: StockConfig;
}
