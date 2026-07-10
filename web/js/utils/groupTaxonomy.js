const GROUP_CANONICAL_MAP = {
    CPO_Optical: '矽光子_CPO',
    Silicon_Photonics: '矽光子_CPO',
    Optical_Transceiver: '矽光子_CPO',
    AI_Server: 'AI伺服器代工',
    AI_Memory: 'AI記憶體',
    ASIC: 'ASIC_IP',
    BBU: 'BBU_電池備援',
    Cooling_Liquid: '散熱模組',
    Cooling_Module: '散熱模組',
    PCB_CCL_Drilling: 'PCB_CCL_ABF',
    Power_Grid: '電源供應器',
    Low_Orbit_Satellite: '低軌衛星_SpaceX鏈',
    Robotics_AI: '機器人_自動化',
    Defense_Aerospace: '軍工_航太',
    Financials: '金融保險業',
    Transportation: '航運業',
    Shipping: '航運業',
    'Real Estate': '建材營造業',
    Materials: '原物料大板塊',
    Consumer: '消費大板塊',
    Semiconductor: '半導體業',
    Optoelectronics: '光電業',
    Healthcare: '生技醫療業',
    Biotechnology: '生技醫療業',
    AI_Ecosystem: 'AI題材',
    Electronics: '電子大板塊',
    Energy: '能源電力',
    Industrials: '工業製造',
    Networking: '網通光通',
    Services: '服務通路',
    Technology: '科技大板塊',
    Heavy_Electrical: '重電設備',
    Green_Energy: '綠能環保',
    Defense: '軍工_航太',
    Fiber_Optic: '網通光通',
};

const GROUP_CANONICAL_BY_LOWER = Object.fromEntries(
    Object.entries(GROUP_CANONICAL_MAP).map(([key, value]) => [key.toLowerCase(), value])
);

export function cleanGroupName(value) {
    const text = String(value || '').trim();
    if (!text || text === '--') return '';
    const lowered = text.toLowerCase();
    if (lowered === 'nan' || lowered === 'null') return '';
    return text;
}

export function canonicalGroupName(value) {
    const name = cleanGroupName(value);
    if (!name) return '';
    return GROUP_CANONICAL_MAP[name] || GROUP_CANONICAL_BY_LOWER[name.toLowerCase()] || name;
}

export function groupAliases(value) {
    const canonical = canonicalGroupName(value);
    if (!canonical) return [];
    const aliases = Object.entries(GROUP_CANONICAL_MAP)
        .filter(([, target]) => target === canonical)
        .map(([source]) => source);
    return [canonical, ...aliases].filter((item, index, arr) => item && arr.indexOf(item) === index);
}

export function openGroupList(value) {
    const canonical = canonicalGroupName(value);
    if (!canonical) return;
    window.GroupSearch?.openGroup(canonical);
}
