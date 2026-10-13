# 全新 Web 工作台驗證紀錄

日期：2026-10-03（Asia/Taipei）
範圍：僅 `/web/rebuild/`。不引用、不檢視舊 UI；資料契約讀取 db.js、NormalizedTrade.swift、Transaction.swift。視覺依使用者 DOCX 31 張概念圖，以及本次新建 SwiftUI。

## 實際通過

- `node --check`：app.mjs、core.mjs、storage.mjs、features.mjs、chart.mjs、sw.js。
- `node --test web/rebuild/core.test.mjs`：7/7 PASS。涵蓋禁止 adjusted pct、市場參考價、上市快照到期、上下限、FIFO成本、異常交易、自選原型汙染防護、OHLCV對齊。
- 真實本機資料 Public_Data：法人榜 52 檔上市資格通過後顯示；原始收盤價來自 daily/tw。
- Playwright 隔離 context（未寫入使用者瀏覽器資料）：新增台積電 2330、10股、100元交易，儲存及持股讀取成功。
- 320、375、390、393、430、1280、1920px 個股頁：document horizontal overflow 均 false。
- 深色個股圖表：方向鍵可逐日移動文字行情提示；K線／成交量分離尺度。
- 共用列表欄位隱藏後 reload：偏好保留。
- SW 安裝後 context.setOffline(true)+reload：新版 shell、快取市場行情可讀；明確快取與原始日期提示。
- 備份完整性：verifyBackup PASS；相同備份再合併 added=0/skipped=1；竄改交易拒絕；來源 hash 不變。
- 上述路徑 pageerror=0。favicon 404 非功能資產。

截圖（本機暫存）：
- /private/tmp/rebuild-web-mobile.png
- /private/tmp/rebuild-web-dark.png
- /private/tmp/rebuild-web-desktop.png

## 資料安全與語意

- daily.pct 已證實由 adj_close 生產，永不作為原始市價漲跌幅。只有來源明示 referencePrice/reference_price 才計算；缺值顯示資料不足。
- 每日上市憑證必須 cutoff 等於台北當日且未過 validThrough；跨日 30 秒檢查會清空目前清單。
- 交易寫入前 checkpoint 保存及 checksum 核對；新增採 add，非 clear/put 全覆寫。
- 合併同主鍵同內容略過，不同內容拒絕。保留既有 IndexedDB 名稱與 store。
- 本機 schema 無 IndexedDB.databases 支援時，新安裝偵測 abort 會回傳合法空資料。
- 備份只 allowlist 自選偏好與交易，不整包匯出 localStorage 金鑰。

## 尚未完成／不得聲稱全案驗收

- 熱力圖既有 Treemap 保留整合、同快照面積／分組／互動效能比較。
- 族群 PE 語意；熱門、量化、輪動、策略、型態雷達、實驗室與回測完整功能。
- 分時、更多指標獨立面板、觸控 pinch、十字線視覺、圖表全套手勢與效能基準。
- 公允價值與估值依據 gate、ETF 再平衡與配息績效、債券資產完整配置。
- 完整歷年績效、年度已實現損益、配息／配股／拆股兼容核算；存在未支援交易時不報資產合計。
- 原有所有版本 migration fixture、完整 field checksum、跨 store 原子復原。
- 券商 PDF／.twstk 匯入、匯率工具、服務金鑰安全設定、摘要音訊。
- 每一個 App/Web route、狀態、動作的逐頁 1:1 視覺和行為驗收；目前 route 契約相同不等於功能全部相同。
- 桌面多面板拖拉配置與欄寬持久偏好、D01–D06 完整工作台。
- 全尺寸/淺深/超大字級/所有錯誤狀態/VoiceOver全矩陣、正式站 runtime、部署及release gate。

狀態：IMPLEMENTED_PARTIAL / QA_PARTIAL；不可替換正式預設入口或宣稱 P0–P10 完成。
