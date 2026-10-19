import {escapeHTML as e, exchangeClockMarkup, number} from './core.mjs';

const TAIWAN = [
  ['IX0001', '加權指數'],
  ['IX0043', '櫃買指數']
];
const UNITED_STATES = [
  ['^DJI', '道瓊工業指數'],
  ['^IXIC', 'NASDAQ 綜合指數'],
  ['^GSPC', 'S&P 500 指數'],
  ['^SOX', '費城半導體指數'],
  ['TSM', '台積電 ADR']
];

function quoteCard(symbol, name, row, {link, favoriteButton}) {
  const unavailable = !row || !Number.isFinite(row.price);
  const movement = Number.isFinite(row?.changePercent)
    ? `${row.changePercent > 0 ? '+' : ''}${number(row.changePercent)}%`
    : '資料不足';
  const title = symbol === 'TSM'
    ? `${link('security', `${name} ${symbol}`, symbol)}${favoriteButton(symbol, name, 'explore-market-TSM')}`
    : `<strong>${e(name)} ${e(symbol)}</strong>`;
  const source = row?.source === 'Fugle'
    ? `台灣 ${e(row.date ?? '日期不足')} ${e(row.time ?? '')}・Fugle・${row.isIntraday ? '即時行情' : '當日快照'}`
    : row?.source === 'Yahoo Finance'
      ? `${symbol === 'IX0001' || symbol === 'IX0043' ? '台灣' : '美東'} ${e(row.date ?? row.asOf ?? '日期不足')} ${e(row.time ?? '')}・Yahoo Finance・${row.isIntraday ? '可能延遲 15 分鐘，非即時' : '當日快照，非即時'}`
      : 'Public_Data 原始收盤';
  return `<article class="explore-market-index" data-explore-index="${e(symbol)}"><div class="explore-market-index-heading">${title}</div><b>${unavailable ? '資料不足' : number(row.price)}</b><span class="${row?.changePercent > 0 ? 'up' : row?.changePercent < 0 ? 'down' : 'muted'}">漲跌幅 ${movement}</span><small>${unavailable ? 'Public_Data 尚無可用行情' : source}</small></article>`;
}

export function exploreMarketMarkup({indices = [], selected = 'taiwan', link, favoriteButton}) {
  const panel = selected === 'us' ? 'us' : 'taiwan';
  const bySymbol = new Map(indices.map(row => [row.symbol, row]));
  const tabs = `<div class="explore-market-tabs" role="group" aria-label="探索市場分頁"><button type="button" data-action="explore-market-tab" data-value="taiwan" aria-pressed="${panel === 'taiwan'}">台股</button><button type="button" data-action="explore-market-tab" data-value="us" aria-pressed="${panel === 'us'}">美股</button></div>`;
  const cards = panel === 'us'
    ? UNITED_STATES.map(([symbol, name]) => quoteCard(symbol, name, bySymbol.get(symbol), {link, favoriteButton})).join('')
    : TAIWAN.map(([symbol, name]) => quoteCard(symbol, name, bySymbol.get(symbol), {link, favoriteButton})).join('');
  const clock = exchangeClockMarkup(panel === 'us' ? 'US' : 'TW');
  const panelSymbols = panel === 'us' ? UNITED_STATES.map(([symbol]) => symbol) : TAIWAN.map(([symbol]) => symbol);
  const panelRows = panelSymbols.map(symbol => bySymbol.get(symbol)).filter(Boolean);
  const live = panelRows.find(row => row.source === 'Fugle' || row.source === 'Yahoo Finance');
  const panelName = panel === 'us' ? '美股' : '台股';
  const dataStatus = live
    ? `${panelName}行情時間：${e(live.date ?? '日期不足')} ${e(live.time ?? '')}・${e(live.source)}${live.source === 'Yahoo Finance' ? '・可能延遲 15 分鐘，非即時' : live.source === 'Fugle' && live.isIntraday ? '・即時行情' : '・當日快照'}`
    : panel === 'us'
      ? `美股資料日：${e(panelRows.find(row => row.asOf)?.asOf ?? '日期不足')}・Public_Data 原始收盤・非即時`
      : `台股指數資料日：${e(bySymbol.get('IX0001')?.asOf ?? '日期不足')}・Public_Data 原始收盤・非即時`;
  return `${tabs}<section class="explore-market-panel" data-explore-market-panel="${panel}" aria-label="${panel === 'us' ? '美股市場摘要' : '台股市場摘要'}">${clock}<div class="explore-market-grid">${cards}</div><p class="source muted">${dataStatus}</p></section><nav class="toolbar" aria-label="市場總覽頁面">${link('heatmap','市場熱力圖')}${link('rankings','行情排行')}${link('rotation','資金輪動')}</nav>`;
}
