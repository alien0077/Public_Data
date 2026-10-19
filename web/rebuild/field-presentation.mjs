import {number} from './core.mjs';

const D06_LABELS=Object.freeze({price:'股價',changePercent:'漲跌幅(%)',turnover:'成交金額(億)',pe:'本益比(倍)',yield:'殖利率(%)'});

export function d06FieldTitle(id,fallback,presentation='default'){
 return presentation==='d06'?(D06_LABELS[id]??fallback):fallback;
}

export function d06FieldValue(row,id,fallback,presentation='default'){
 if(presentation!=='d06'||id!=='turnover')return fallback;
 return typeof row?.turnover==='number'&&Number.isFinite(row.turnover)?number(row.turnover/100_000_000):'資料不足';
}
