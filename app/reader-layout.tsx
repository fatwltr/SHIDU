'use client';
import {useEffect,useRef,useState,type CSSProperties,type ReactNode,type PointerEvent,type KeyboardEvent} from 'react';
import './reader-layout.css';
const KEY='shidu-sidebar-width',MIN=220,DEFAULT=260,MAX=480;
const clamp=(value:number,max:number)=>Math.round(Math.max(MIN,Math.min(max,value)));
export default function ReaderLayout({children}:{children:ReactNode}){
 const [preferred,setPreferred]=useState(DEFAULT),[maximum,setMaximum]=useState(MAX),[dragging,setDragging]=useState(false);
 const captured=useRef<number|null>(null),dragStart=useRef({x:0,width:DEFAULT});const width=clamp(preferred,maximum);
 useEffect(()=>{
  try{const saved=localStorage.getItem(KEY);const n=saved===null?NaN:Number(saved);if(Number.isFinite(n))setPreferred(clamp(n,MAX));}catch{}
  const resize=()=>setMaximum(Math.max(MIN,Math.min(MAX,window.innerWidth-380)));resize();window.addEventListener('resize',resize);
  const sync=(e:StorageEvent)=>{if(e.key===KEY){const n=e.newValue===null?DEFAULT:Number(e.newValue);if(Number.isFinite(n))setPreferred(clamp(n,MAX));}};window.addEventListener('storage',sync);
  const blur=()=>{setDragging(false);captured.current=null;};window.addEventListener('blur',blur);
  return()=>{window.removeEventListener('resize',resize);window.removeEventListener('storage',sync);window.removeEventListener('blur',blur);};
 },[]);
 function save(value:number){const n=clamp(value,maximum);setPreferred(n);try{localStorage.setItem(KEY,String(n));}catch{}}
 function start(e:PointerEvent<HTMLDivElement>){if(e.button!==0||!e.isPrimary)return;e.preventDefault();captured.current=e.pointerId;dragStart.current={x:e.clientX,width};e.currentTarget.setPointerCapture(e.pointerId);setDragging(true);}
 function move(e:PointerEvent<HTMLDivElement>){if(captured.current===e.pointerId)setPreferred(clamp(dragStart.current.width+e.clientX-dragStart.current.x,maximum));}
 function finish(e:PointerEvent<HTMLDivElement>){if(captured.current!==e.pointerId)return;save(e.type==='pointercancel'?width:dragStart.current.width+e.clientX-dragStart.current.x);captured.current=null;setDragging(false);if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}
 function key(e:KeyboardEvent<HTMLDivElement>){let next:number;switch(e.key){case 'ArrowLeft':next=width-(e.shiftKey?32:16);break;case 'ArrowRight':next=width+(e.shiftKey?32:16);break;case 'Home':next=MIN;break;case 'End':next=maximum;break;case 'Enter':next=DEFAULT;break;default:return;}e.preventDefault();save(next);}
 return <div className={`app-shell ${dragging?'is-resizing':''}`} style={{'--sidebar-width':`${width}px`} as CSSProperties}>{children}<div className="sidebar-resizer" role="separator" tabIndex={0} aria-orientation="vertical" aria-label="调整侧栏宽度" aria-controls="reader-sidebar reader-content" aria-valuemin={MIN} aria-valuemax={maximum} aria-valuenow={width} aria-valuetext={`${width} 像素`} title="拖动调整侧栏宽度；双击或按 Enter 恢复默认，方向键微调" onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={()=>{captured.current=null;setDragging(false);}} onDoubleClick={()=>save(DEFAULT)} onKeyDown={key}><span/></div></div>;
}
