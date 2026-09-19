# Public Data / Private Quant boundary

`Public_Data` is the public **Data & Generic Feature Factory**.

Allowed here:
- official/public-source acquisition and normalization;
- PIT-safe data reconstruction that does not encode a trading/valuation decision;
- generic indicators/features such as MA, RSI, volatility, returns, PE/PB/EY inputs, revenue growth, institutional flow, TDCC concentration, sector aggregates and percentiles;
- health, lineage, checksums, changed-symbol manifests and consumer-compatible published outputs.

Prohibited here:
- Fair Value formulas, weights, nonlinear penalties, turning points and trap filters;
- Ranking/ensemble selection logic;
- Pattern Detect, Trend Hunter, Market Regime, Sector Rotation, Radar decision logic;
- entry/exit/SL/TP/trailing rules and portfolio construction;
- model coefficients, calibration/search outputs, private backtests, prompts or secrets.

Public outputs may contain final consumer-facing values produced by the private engine when intentionally published, but must not contain enough parameters or research artifacts to reconstruct the proprietary decision logic.

The proprietary implementation lives only in `alien0077/TWStockTracker`.
