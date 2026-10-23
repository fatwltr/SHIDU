'use client';
import {useId,useState} from 'react';
import {ChevronDown,ChevronRight,AlertCircle,Tag} from 'lucide-react';
import {groupFeedsByTag} from '../lib/reader-filters';
type Feed={id:string;title:string;category:string;error:string|null};
export default function FeedGroups({feeds,view,selectedTag,unread,onFeed,onTag}:{feeds:Feed[];view:string;selectedTag:string|null;unread:Record<string,number>;onFeed:(id:string)=>void;onTag:(tag:string)=>void}){
 const [collapsed,setCollapsed]=useState<Set<string>>(()=>new Set());const prefix=useId();
 const groups=groupFeedsByTag(feeds);
 return <>{groups.map(({tag,feeds:items},index)=>{const closed=collapsed.has(tag),id=prefix+'-'+encodeURIComponent(tag);return <section className="feed-tag-group" key={tag}>
  <div className={`feed-tag-heading ${selectedTag===tag?'selected':''}`}><button type="button" className="tag-collapse" aria-label={`${closed?'展开':'收起'}${tag}标签订阅源`} aria-expanded={!closed} aria-controls={id} onClick={()=>setCollapsed(prev=>{const next=new Set(prev);if(next.has(tag))next.delete(tag);else next.add(tag);return next;})}>{closed?<ChevronRight size={14}/>:<ChevronDown size={14}/>}</button><button type="button" className="tag-open" onClick={()=>onTag(tag)} aria-pressed={selectedTag===tag} title={`查看「${tag}」的全部订阅文章`}><Tag size={12}/><span>{tag}</span><small>{items.length}</small></button></div>
  <div id={id} className="feed-tag-items" hidden={closed}>{items.map(f=><button key={f.id} className={`feed-choice ${view===f.id?'active':''}`} onClick={()=>onFeed(f.id)} title={f.title} aria-current={view===f.id?'page':undefined}><span className={`feed-icon color-${index%4}`}>{f.title.slice(0,1)}</span><span className="feed-name">{f.title}</span>{f.error?<AlertCircle size={13} className="error-color"/>:<small>{unread[f.id]||''}</small>}</button>)}</div>
 </section>;})}</>;
}
