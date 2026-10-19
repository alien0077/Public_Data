export function filterThemeGroups(sectors, query = '', isEligible = () => true) {
 const normalized=String(query??'').trim().toLocaleLowerCase();
 return (Array.isArray(sectors)?sectors:[]).map(group=>{
  const label=String(group.display_tag||group.sector_tag||'分類不足');
  const groupMatch=label.toLocaleLowerCase().includes(normalized)||String(group.sector_tag||'').toLocaleLowerCase().includes(normalized);
  const members=(Array.isArray(group.stocks)?group.stocks:[]).filter(stock=>{
   const symbol=String(stock.stock_id??'');
   return isEligible(symbol)&&(!normalized||groupMatch||`${stock.name||''} ${symbol}`.toLocaleLowerCase().includes(normalized));
  });
  return {label,group,members};
 }).filter(item=>item.members.length>0);
}

export function chooseThemeGroup(groups, selectedTag = '') {
 if(!Array.isArray(groups)||!groups.length)return null;
 return groups.find(item=>item.group?.sector_tag===selectedTag)||groups[0];
}
