export function escapeHtml(value = '') {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

export function stockIdentityHTML(symbol, name, options = {}) {
    const {
        className = '',
        symbolClass = '',
        nameClass = '',
        badgeHTML = ''
    } = options;
    const safeSymbol = escapeHtml(symbol || '');
    const safeName = escapeHtml(name || symbol || '');

    // 🚀 v1.4: 自動附加推估融資維持率 badge（若 MarginPressure 已載入）
    let marginBadge = badgeHTML;
    if (!marginBadge && window.MarginPressure) {
        marginBadge = MarginPressure.getBadgeHTML(symbol);
    }

    return `
        <div class="stock-identity ${className}">
            <div class="stock-identity-main">
                <span class="stock-symbol ${symbolClass}">${safeSymbol}</span>
                ${marginBadge}
            </div>
            <div class="stock-name ${nameClass}">${safeName}</div>
        </div>
    `;
}

export function stockMetricHTML(label, value, options = {}) {
    const { className = '', valueClass = '', labelClass = '' } = options;
    return `
        <div class="stock-metric ${className}">
            <div class="stock-metric-value ${valueClass}">${value}</div>
            <div class="stock-metric-label ${labelClass}">${escapeHtml(label)}</div>
        </div>
    `;
}

export function fairValueHTML(valuation) {
    if (!valuation || valuation.status !== 'ok' || !Number.isFinite(Number(valuation.fair_value))) {
        return '<span class="text-[10px] text-gray-400" title="估值資料不足">資料不足</span>';
    }
    const fairValue = Number(valuation.fair_value);
    const upside = Number(valuation.upside);
    const upsideText = Number.isFinite(upside) ? `${upside >= 0 ? '▲' : '▼'} ${(Math.abs(upside) * 100).toFixed(1)}%` : '--';
    const upsideClass = Number.isFinite(upside) ? (upside >= 0 ? 'text-red-500' : 'text-green-500') : 'text-gray-400';
    const signal = valuation.valuation_signal_label || (
        upside > 0 ? '低估' : upside < 0 ? '高估' : '合理區間'
    );
    const signalClass = signal === '低估' ? 'text-red-500' : signal === '高估' ? 'text-green-500' : 'text-orange-500';
    const spreadText = Number.isFinite(Number(valuation.model_spread))
        ? ` · 模型分歧 ${(Number(valuation.model_spread) * 100).toFixed(0)}%`
        : '';
    return `<div class="font-bold ${upsideClass}" title="${escapeHtml(valuation.model || '自有公允價')}，估值中樞">${fairValue.toFixed(1)}</div><div class="text-[10px] ${upsideClass}">${upsideText}</div><div class="text-[10px] font-bold ${signalClass}" title="${escapeHtml(`以模型中位數與 25%-75% 合理區間判定${spreadText}`)}">${escapeHtml(signal)}</div>`;
}

export function fairValueMetricHTML(valuation) {
    if (!valuation || valuation.status !== 'ok' || !Number.isFinite(Number(valuation.fair_value))) {
        return stockMetricHTML('公允價', '--', { valueClass: 'text-gray-400' });
    }
    const signal = valuation.valuation_signal_label || '合理區間';
    const color = signal === '低估' ? 'text-red-500' : signal === '高估' ? 'text-green-500' : 'text-orange-500';
    return stockMetricHTML('公允價', Number(valuation.fair_value).toFixed(1), { valueClass: color, labelClass: color });
}

export function maintenanceLevel(ratio) {
    if (ratio < 140) return 'HIGH';
    if (ratio < 150) return 'CAUTION';
    if (ratio < 166) return 'NORMAL';
    return 'LOW';
}

export function stockMarginMaintenanceBadgeHTML(ratio) {
    if (!Number.isFinite(ratio) || ratio <= 0) return '';
    const colors = {
        HIGH: 'text-red-500 bg-red-500/10 border-red-500/30',
        CAUTION: 'text-orange-500 bg-orange-500/10 border-orange-500/30',
        NORMAL: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/30',
        LOW: 'text-green-500 bg-green-500/10 border-green-500/30'
    };
    const level = maintenanceLevel(ratio);
    return `<span class="text-[10px] font-bold px-1.5 py-0.5 rounded border ${colors[level]}" title="推估融資維持率">${ratio.toFixed(1)}%</span>`;
}

export function stockMobileCardHTML({
    symbol,
    name,
    badgeHTML = '',
    primaryHTML = '',
    quoteHTML = '',
    metricsHTML = '',
    detailHTML = '',
    actionsHTML = '',
    onClick = '',
    valuation = null
}) {
    const clickAttr = onClick ? ` onclick="${onClick}"` : '';
    const hasQuotePair = Boolean(quoteHTML && valuation);
    const topPrimaryHTML = hasQuotePair ? primaryHTML : (quoteHTML || primaryHTML);
    return `
        <div class="stock-card-row"${clickAttr}>
            <div class="stock-card-top">
                ${stockIdentityHTML(symbol, name, { badgeHTML })}
                ${topPrimaryHTML ? `<div class="stock-card-primary">${topPrimaryHTML}</div>` : ''}
            </div>
            ${hasQuotePair ? `<div class="stock-card-quote-pair">
                <div class="stock-card-quote-cell">${quoteHTML}<div class="stock-card-quote-label">現價</div></div>
                ${fairValueMetricHTML(valuation)}
            </div>` : ''}
            ${metricsHTML || (valuation && !hasQuotePair) ? `<div class="stock-card-metrics">${valuation && !hasQuotePair ? fairValueMetricHTML(valuation) : ''}${metricsHTML}</div>` : ''}
            ${detailHTML ? `<div class="stock-card-detail">${detailHTML}</div>` : ''}
            ${actionsHTML ? `<div class="stock-card-actions">${actionsHTML}</div>` : ''}
        </div>
    `;
}
