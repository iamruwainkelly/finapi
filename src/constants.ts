import path from 'node:path';

const downloadsFolder = path.join('downloads');
const dataSourcesFolder = path.join(downloadsFolder, 'datasources');

// news datasource paths

export const getNewsDatasourceJsonFileName = (symbol: string) => {
  return `investing-com-${symbol.replaceAll('^', '')}.json`;
};

export const getNewsDatasourceHtmlFileName = (symbol: string) => {
  return `investing-com-${symbol.replaceAll('^', '')}.html`;
};

export const getNewsDatasourceFileName = (symbol: string) => {
  return getNewsDatasourceHtmlFileName(symbol);
};

export const getNewsDatasourceFullFilePath = (symbol: string) => {
  return path.join(dataSourcesFolder, getNewsDatasourceFileName(symbol));
};

// market mover specific paths

export const getMarketMoverDatasourceHtmlFileName = (symbol: string) => {
  return `investing-com-${symbol.replaceAll('^', '')}.html`;
};

export const getMarketMoverDatasourceFileName = (symbol: string) => {
  return getMarketMoverDatasourceHtmlFileName(symbol);
};

export const getMarketMoverDatasourceFullFilePath = (symbol: string) => {
  return path.join(dataSourcesFolder, getMarketMoverDatasourceFileName(symbol));
};
