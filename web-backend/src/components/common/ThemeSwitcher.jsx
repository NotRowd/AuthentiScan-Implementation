import {useId,useSyncExternalStore} from 'react';
import {Sun,Moon} from 'lucide-react';
function subscribe(listener){window.addEventListener('authentiscan-theme-change',listener);return()=>window.removeEventListener('authentiscan-theme-change',listener);}
const getPreference=()=>window.AuthentiScanTheme?.getPreference()||'light';
const getError=()=>window.AuthentiScanTheme?.getSaveError()||'';
export default function ThemeSwitcher({compact=false}){
 const id=useId(),selected=useSyncExternalStore(subscribe,getPreference,()=> 'light'),error=useSyncExternalStore(subscribe,getError,()=> '');
 const change=value=>window.AuthentiScanTheme?.setPreference(value);
 return <div className={'theme-picker'+(compact?' theme-picker-compact':'')}>
  {!compact&&<span className="theme-picker-label">Appearance</span>}
  <div className="theme-picker-row">
   {!compact&&<span id={id} className="theme-picker-value">{selected==='dark'?'Dark':'Light'}</span>}
   <button type="button" className="theme-pill" role="switch" aria-label="Dark mode" aria-checked={selected==='dark'} aria-describedby={compact?undefined:id} onClick={()=>change(selected==='dark'?'light':'dark')} onKeyDown={event=>{const next=['ArrowLeft','ArrowDown','Home'].includes(event.key)?'light':['ArrowRight','ArrowUp','End'].includes(event.key)?'dark':null;if(next){event.preventDefault();change(next);}}}>
    <span className="theme-pill-thumb" aria-hidden="true"/><Sun size={20} className="theme-pill-sun" aria-hidden="true"/><Moon size={20} className="theme-pill-moon" aria-hidden="true"/>
   </button>
  </div>
  {!!error&&<div className="theme-picker-error" role="status">{error} <button type="button" onClick={()=>change(selected)}>Retry saving theme</button></div>}
 </div>;
}
