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
    return `<div class="font-bold ${upsideClass}" title="${escapeHtml(valuation.model || '自有公允價')}，基準估值">${fairValue.toFixed(1)}</div><div class="text-[10px] ${upsideClass}">${upsideText}</div>`;
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
    metricsHTML = '',
    detailHTML = '',
    actionsHTML = '',
    onClick = ''
}) {
    const clickAttr = onClick ? ` onclick="${onClick}"` : '';
    return `
        <div class="stock-card-row"${clickAttr}>
            <div class="stock-card-top">
                ${stockIdentityHTML(symbol, name, { badgeHTML })}
                <div class="stock-card-primary">${primaryHTML}</div>
            </div>
            ${metricsHTML ? `<div class="stock-card-metrics">${metricsHTML}</div>` : ''}
            ${detailHTML ? `<div class="stock-card-detail">${detailHTML}</div>` : ''}
            ${actionsHTML ? `<div class="stock-card-actions">${actionsHTML}</div>` : ''}
        </div>
    `;
}
