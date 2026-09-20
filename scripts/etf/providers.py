# providers.py
# ETF 發行商映射表與其官網抓取邏輯基礎

ETF_PROVIDERS = {
    "yuanta": {
        "name": "元大投信",
        "base_url": "https://www.yuantaetfs.com/product/detail/{etf_id}/Ratio"
    },
    "fubon": {
        "name": "富邦投信",
        "base_url": "https://www.fubon.com/asset-management/etf/product-detail?fund_id={etf_id}"
    },
    "cathay": {
        "name": "國泰投信",
        "base_url": "https://www.cathaysite.com.tw/ETF/fund/{etf_id}"
    },
    "ctbc": {
        "name": "中國信託投信",
        "base_url": "https://www.ctbcfunds.com/etf/fund-details.html?id={etf_id}"
    },
    "sinopac": {
        "name": "永豐投信",
        "base_url": "https://sitc.sinopac.com/newweb/fund/etf.aspx?prod={etf_id}"
    },
    "capital": {
        "name": "群益投信",
        "base_url": "https://www.capitalfund.com.tw/ETF/product_detail?id={etf_id}"
    },
    "fuhwa": {
        "name": "復華投信",
        "base_url": "https://www.fhtrust.com.tw/Fund/Fund_Basic?fund_id={etf_id}"
    },
    "kgi": {
        "name": "凱基投信",
        "base_url": "https://www.kgifund.com.tw/ETF/Detail/{etf_id}"
    },
    "nomura": {
        "name": "野村投信",
        "base_url": "https://www.nomurafunds.com.tw/Web/Content/FundDetail.aspx?FundID={etf_id}"
    },
    "upmc": {
        "name": "統一投信",
        "base_url": "https://www.upmc.com.tw/Fund/Detail/{etf_id}"
    },
    "megafund": {
        "name": "兆豐投信",
        "base_url": "https://www.megafunds.com.tw/etf/product-detail?id={etf_id}"
    },
    "shinkong": {
        "name": "新光投信",
        "base_url": "https://www.skit.com.tw/fund/etf_detail.aspx?id={etf_id}"
    },
    "da-hua": {
        "name": "大華銀投信",
        "base_url": "https://www.uobam.com.tw/ETF/ProductDetail/{etf_id}"
    },
    "taishin": {
        "name": "台新投信",
        "base_url": "https://www.tsit.com.tw/ETF/ProductDetail/{etf_id}"
    },
    "allianz": {
        "name": "安聯投信",
        "base_url": "https://www.allianzgi.com.tw/zh-tw/products/etf-{etf_id}"
    },
    "jkos": {
        "name": "街口投信",
        "base_url": "https://www.jkofunds.com.tw/fund/etf-detail/{etf_id}"
    }
}
