# 新版篩選器驗證

只使用 `/web/rebuild/#/scanner`；測試 isolated browser context，不載入舊 UI。

1. 固定 listing snapshot 有效日 fixture，從 canonical daily 資料選至少一筆 TWSE 及 TPEX（不得以過期 snapshot 冒充當日行情）。
2. 初次進入：所有條件空白，市場「全部」，結果數等於已通過 eligibility gate 的行情筆數。
3. 輸入名稱／代號／產業，市場、最低與最高原始市價、最低成交股數；套用後逐筆檢查 conjunction 與 inclusive 邊界。
4. 輸入负數、NaN、Infinity、無效字串、最低價大於最高價：顯示明確錯誤，保留先前已套用結果與目前輸入，不默默套用。
5. 修改但未套用條件，切換其他路由再返回：未套用草稿與原先結果均保留。無效條件錯誤也保留。
6. 清除：條件回空、市場全部、錯誤消失、結果恢復所有 eligible rows。
7. 暫時缺 price/volume fixture：未啟用該條件時保留，啟用時排除；非 eligible fixture 不應進入 `state.rows`。
8. 320/375/393/430px 淺深色、1280px 桌面：長中文、錯誤訊息、結果卡片無水平溢出；鍵盤 Enter 套用、Tab 聚焦、結果股票可開新個股頁。

純邏輯：`node --test web/rebuild/scanner.test.mjs`。瀏覽器實跑狀態由主施工代理統一記錄。

## 2026-10-07 實跑證據

- 狀態：SCANNER_BROWSER_PASS；本次只涵蓋新版篩選器，不代表全頁面完成。
- `scanner.test.mjs` 8/8 PASS，加既有 core 12/12，共 20/20 PASS；features/sw 語法 PASS。
- 無頭系統 Chrome、獨立 context、local HTTP server；固定時鐘為 snapshot.cutoff 的 2026-10-07，不宣稱當日即時服務驗證。
- 320、375、393、430 px × light/dark 共 8 組 PASS，各載入 2212 筆 eligible rows，pageErrors 空。
- 各組：2330 條件套用；minPrice 200 > maxPrice 100 錯誤保留既有結果；跨路由保留 invalid 草稿；reload 僅恢復有效已套用條件；Infinity 拒絕；清除及再次 reload 回 2212 筆；無水平溢出。
- localStorage key：`rebuild.scanner.v1`，讀回再驗證；損壞／非法條件回安全空條件。Invalid 草稿不寫入 localStorage。
- 瀏覽器腳本：`/private/tmp/rebuild-scanner-browser.mjs`
- 結果記錄：`/private/tmp/rebuild-scanner-browser.log`
- 截圖：`/private/tmp/scanner-{320,375,393,430}-{light,dark}.png`；已目視檢查 320 dark 的表單與錯誤文字可读。
