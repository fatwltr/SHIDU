'use client';
import {useEffect,useRef,useState} from 'react';
import {Palette,X,Check,Sun,Moon,Monitor,Leaf,BookOpen} from 'lucide-react';
import './themes.css';
const themes=[
 {id:'day',name:'极简白昼',english:'CLEAR DAY',description:'纯白留白 · 石墨文字 · 专注阅读',icon:Sun},
 {id:'night',name:'深空终端',english:'DEEP SPACE',description:'深蓝黑底 · 冰青光线 · 科技夜读',icon:Moon},
 {id:'paper',name:'暖纸书房',english:'PAPER & INK',description:'暖米纸色 · 琥珀点缀 · 书卷气息',icon:BookOpen},
 {id:'forest',name:'森间晨雾',english:'FOREST MIST',description:'雾绿界面 · 苔绿细节 · 自然舒缓',icon:Leaf},
] as const;
type Preference=typeof themes[number]['id']|'system';
function valid(value:unknown):value is Preference{return value==='system'||themes.some(t=>t.id===value);}
export default function ThemePicker(){
 const [open,setOpen]=useState(false),[preference,setPreference]=useState<Preference>('day'),[darkSystem,setDarkSystem]=useState(false),[ready,setReady]=useState(false);
 const panel=useRef<HTMLElement>(null),trigger=useRef<HTMLButtonElement>(null);
 useEffect(()=>{
  const media=matchMedia('(prefers-color-scheme: dark)');setDarkSystem(media.matches);
  try{const saved=localStorage.getItem('shidu-theme');if(valid(saved))setPreference(saved);}catch{}
  setReady(true);
  const changed=()=>setDarkSystem(media.matches);media.addEventListener('change',changed);
  const sync=(e:StorageEvent)=>{if(e.key==='shidu-theme')setPreference(valid(e.newValue)?e.newValue:'day');};window.addEventListener('storage',sync);
  return()=>{media.removeEventListener('change',changed);window.removeEventListener('storage',sync);};
 },[]);
 useEffect(()=>{if(ready)document.documentElement.dataset.theme=preference==='system'?(darkSystem?'night':'day'):preference;},[preference,darkSystem,ready]);
 useEffect(()=>{
  if(!open)return;const previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
  panel.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus();
  const key=(e:KeyboardEvent)=>{
   if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();setOpen(false);}
   if(e.key==='Tab'){const buttons=Array.from(panel.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')||[]);const first=buttons[0],last=buttons[buttons.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
  };
  document.addEventListener('keydown',key,true);
  return()=>{document.body.style.overflow=previousOverflow;document.removeEventListener('keydown',key,true);trigger.current?.focus();};
 },[open]);
 function choose(value:Preference){setPreference(value);try{localStorage.setItem('shidu-theme',value);}catch{}}
 const active=themes.find(t=>t.id===(preference==='system'?(darkSystem?'night':'day'):preference))!;
 return <><button ref={trigger} type="button" className="theme-trigger" onClick={()=>setOpen(true)} aria-haspopup="dialog" aria-expanded={open} title={`切换主题 · 当前${active.name}`}><Palette size={16}/><span>主题</span><i className="theme-trigger-dot"/></button>
 {open&&<div className="modal-backdrop theme-backdrop" onClick={()=>setOpen(false)}><section ref={panel} className="theme-panel" role="dialog" aria-modal="true" aria-labelledby="theme-heading" aria-describedby="theme-description" onClick={e=>e.stopPropagation()}>
  <div className="theme-panel-heading"><div><div className="theme-eyebrow">MAKE ROOM FOR YOUR MOOD</div><h2 id="theme-heading">换一种心情，继续阅读。</h2><p id="theme-description">四种阅读氛围，点击即可预览。选择会自动保存。</p></div><button className="theme-close" aria-label="关闭主题设置" onClick={()=>setOpen(false)}><X size={20}/></button></div>
  <div className="theme-options">{themes.map(({id,name,english,description,icon:Icon})=><button type="button" key={id} className={`theme-option ${preference===id?'chosen':''}`} aria-pressed={preference===id} onClick={()=>choose(id)}>
   <div className={`theme-sample sample-${id}`} aria-hidden="true"><div className="sample-rail"><i/><b/><b/><b/></div><div className="sample-page"><div className="sample-head"><span/><i/></div><strong>留一刻，给阅读。</strong><div className="sample-banner"/><div className="sample-story"><b/><span/><span/></div><div className="sample-story"><b/><span/><span/></div></div><span className="sample-selection"><Check size={14}/></span></div>
   <div className="theme-option-label"><span><Icon size={16}/>{name}</span><small>{english}</small></div><p>{description}</p>
  </button>)}</div>
  <div className="theme-panel-footer"><button type="button" className={`theme-system ${preference==='system'?'enabled':''}`} aria-pressed={preference==='system'} onClick={()=>choose(preference==='system'?active.id:'system')}><Monitor size={17}/><span>跟随系统<small>随设备的深浅模式自动切换</small></span><i className="theme-switch"><b/></i></button><div className="theme-saved" role="status"><Check size={13}/>{preference==='system'?'跟随系统 · ':''}{active.name} · 已应用</div></div>
 </section></div>}</>;
}
