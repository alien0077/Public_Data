import assert from 'node:assert/strict';
import {calculateFinancialTool,financialToolsMarkup} from './financial-tools.mjs';

const values=object=>new Map(Object.entries(object));
assert.equal(calculateFinancialTool('investment',values({shares:'1000',price:'100'})),'預估投資金額：100,000.00 元');
assert.match(calculateFinancialTool('investment',values({shares:'-1',price:'100'})),/有效/);
assert.equal(calculateFinancialTool('ex-dividend',values({previous:'100',cash:'2',stock:'1',par:'10',subscription:'0',rights:'0'})),'試算除權息參考價：89.09 元');
assert.match(calculateFinancialTool('ex-dividend',values({previous:'1',cash:'2',stock:'0',par:'10',subscription:'0',rights:'0'})),/無效/);
assert.equal(calculateFinancialTool('dividend',values({shares:'1000',perShare:'2',price:'100'})),'稅前現金股利：2,000.00 元；參考殖利率：2.00%');
const markup=financialToolsMarkup();
for(const tool of ['investment','ex-dividend','dividend'])assert.match(markup,new RegExp(`data-financial-tool="${tool}"`));
assert.match(markup,/wwwc\.twse\.com\.tw/);
console.log('financial-tools: 6 checks passed');
