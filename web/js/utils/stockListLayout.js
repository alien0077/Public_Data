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

    return `
        <div class="stock-identity ${className}">
            <div class="stock-identity-main">
                <span class="stock-symbol ${symbolClass}">${safeSymbol}</span>
                ${badgeHTML}
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

export function stockMarginPressureBadgeHTML(score, level = 'LOW') {
    if (score == null) return '';
    const colors = {
        HIGH: 'text-red-500 bg-red-500/10 border-red-500/30',
        CAUTION: 'text-orange-500 bg-orange-500/10 border-orange-500/30',
        NORMAL: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/30',
        LOW: 'text-green-500 bg-green-500/10 border-green-500/30'
    };
    const labels = { HIGH: '高', CAUTION: '注意', NORMAL: '正常', LOW: '低' };
    const cls = colors[level] || colors.LOW;
    const label = labels[level] || '低';
    return `<span class="text-[10px] font-bold px-1.5 py-0.5 rounded border ${cls}">${label} ${score}</span>`;
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
