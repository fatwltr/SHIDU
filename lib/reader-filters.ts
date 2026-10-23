export const tagName=(value?:string|null)=>value?.trim()||'未分类';
export function groupFeedsByTag<T extends {category?:string|null}>(feeds:T[]){
 const groups=new Map<string,T[]>();
 for(const feed of feeds){const tag=tagName(feed.category);const group=groups.get(tag)||[];group.push(feed);groups.set(tag,group);}
 return [...groups].sort(([a],[b])=>a.localeCompare(b,'zh-CN')).map(([tag,items])=>({tag,feeds:items}));
}
export function feedsWithTag<T extends {category?:string|null}>(feeds:T[],tag:string|null){return tag===null?feeds:feeds.filter(f=>tagName(f.category)===tag);}
// null explicitly means all feeds; an empty array means no feeds, never all.
export function readScope<T extends {id:string;category?:string|null}>(feeds:T[],view:string,tag:string|null):string[]|null{
 const active=feeds.find(f=>f.id===view);if(active)return [active.id];
 return tag===null?null:feedsWithTag(feeds,tag).map(f=>f.id);
}
