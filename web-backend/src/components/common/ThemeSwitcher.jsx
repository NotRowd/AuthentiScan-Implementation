import {useId, useSyncExternalStore} from 'react';

function subscribe(listener) {
  window.addEventListener('authentiscan-theme-change', listener);
  return () => window.removeEventListener('authentiscan-theme-change', listener);
}
function getPreference() { return window.AuthentiScanTheme?.getPreference() || 'system'; }

export default function ThemeSwitcher({compact=false}) {
  const id=useId();
  const selected=useSyncExternalStore(subscribe,getPreference,()=> 'system');
  const change=value=>window.AuthentiScanTheme?.setPreference(value);
  if(compact)return <div className="theme-picker theme-picker-compact">
    <label htmlFor={id} className="sr-only">Appearance</label>
    <select id={id} value={selected} onChange={event=>change(event.target.value)}>
      <option value="light">Light</option><option value="dark">Dark</option><option value="system">System</option>
    </select>
  </div>;
  return <div className="theme-picker">
    <span id={id} className="theme-picker-label">Appearance</span>
    <div className="theme-picker-options" role="group" aria-labelledby={id}>
      {['light','dark','system'].map(value=><button key={value} type="button" aria-pressed={selected===value} onClick={()=>change(value)}>{value[0].toUpperCase()+value.slice(1)}</button>)}
    </div>
  </div>;
}
