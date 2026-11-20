import {useEffect,useRef,useState} from 'react';
import {X,RotateCcw,RotateCw,FlipHorizontal,FlipVertical} from 'lucide-react';
import {saveAvatar,removeAvatar} from '../../services/api';

export default function AvatarEditor({user,onSaved,compact=false}){
  const input=useRef(null),dialog=useRef(null),canvas=useRef(null),drag=useRef(null),trigger=useRef(null),saving=useRef(false);
  const [image,setImage]=useState(null),[source,setSource]=useState(''),[zoom,setZoom]=useState(1),[rotation,setRotation]=useState(0),[flip,setFlip]=useState([1,1]),[pan,setPan]=useState([0,0]);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  useEffect(()=>()=>{if(source)URL.revokeObjectURL(source);},[source]);
  useEffect(()=>{
    if(!image||!canvas.current)return;
    const context=canvas.current.getContext('2d'),side=512;
    const odd=Math.abs(rotation%180)===90,w=odd?image.height:image.width,h=odd?image.width:image.height;
    const scale=side/Math.min(w,h)*zoom;
    const x=Math.max(-(w*scale-side)/2,Math.min((w*scale-side)/2,pan[0]));
    const y=Math.max(-(h*scale-side)/2,Math.min((h*scale-side)/2,pan[1]));
    context.fillStyle='#fff';context.fillRect(0,0,side,side);context.save();
    context.translate(side/2+x,side/2+y);context.rotate(rotation*Math.PI/180);context.scale(scale*flip[0],scale*flip[1]);
    context.drawImage(image,-image.width/2,-image.height/2);context.restore();
  },[image,zoom,rotation,flip,pan]);
  function close(){if(saving.current)return;dialog.current.close();setImage(null);setSource('');setError('');trigger.current?.focus();}
  async function choose(event){
    const file=event.target.files?.[0];event.target.value='';if(!file)return;
    setError('');setMessage('');
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024){setError('Choose a JPEG, PNG, or WebP photo up to 10 MB.');return;}
    const url=URL.createObjectURL(file),photo=new Image();photo.src=url;
    try{await photo.decode();if(photo.width*photo.height>16000000)throw new Error();}
    catch{URL.revokeObjectURL(url);setError('This photo could not be opened. Use a valid image up to 16 million pixels.');return;}
    setImage(photo);setSource(url);setZoom(1);setRotation(0);setFlip([1,1]);setPan([0,0]);
    dialog.current.showModal();
  }
  async function save(){
    if(saving.current||!image)return;saving.current=true;setBusy(true);setError('');
    try{
      const file=await new Promise(resolve=>canvas.current.toBlob(resolve,'image/jpeg',0.9));
      if(!file)throw new Error('Could not prepare your photo. Choose it again.');
      const result=await saveAvatar(file);onSaved(result.data);dialog.current.close();setImage(null);setSource('');setMessage('Profile photo saved.');trigger.current?.focus();
    }catch(e){setError(e.message||'Could not save your photo. Please retry.');}finally{saving.current=false;setBusy(false);}
  }
  async function remove(){
    if(saving.current||!window.confirm('Remove your profile photo? Your initials will be shown instead.'))return;saving.current=true;setBusy(true);setError('');setMessage('');
    try{const result=await removeAvatar();onSaved(result.data);setMessage('Profile photo removed.');}catch(e){setError(e.message);}finally{saving.current=false;setBusy(false);}
  }
  const button='btn text-xs sm:text-sm disabled:opacity-100 disabled:bg-disabled disabled:text-disabled-ink disabled:border-line';
  return <div className={compact?"profile-avatar-controls":"w-full mt-4"}>
    <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-label="Choose profile photo" onChange={choose}/>
    <button ref={trigger} type="button" disabled={busy} className="btn w-full" onClick={()=>input.current.click()}>Edit Avatar</button>
    {user?.avatar_url&&<button type="button" disabled={busy} className="mt-3 text-sm font-semibold text-ink-secondary underline underline-offset-4 disabled:opacity-100 disabled:bg-disabled disabled:text-disabled-ink disabled:border-line" onClick={remove}>Remove photo</button>}
    {message&&<p role="status" className="text-sm text-success mt-3">{message}</p>}
    {!image&&error&&<p role="alert" className="text-sm text-danger mt-3">{error}</p>}
    <dialog ref={dialog} aria-labelledby="avatar-title" aria-describedby="avatar-description" onCancel={e=>{e.preventDefault();close();}} style={{width:'calc(100% - 2rem)'}} className="m-auto max-w-xl max-h-[90dvh] overflow-y-auto rounded-3xl bg-surface p-5 sm:p-6 text-ink shadow-xl backdrop:bg-overlay/50">
      <div className="flex items-start justify-between gap-3 text-left"><div><h2 id="avatar-title" className="text-xl font-bold">Edit profile photo</h2><p id="avatar-description" className="text-sm text-ink-muted mt-1">Drag to reposition, or use the position controls. Crop, rotate, or flip before saving.</p></div><button type="button" aria-label="Close photo editor" disabled={busy} className="p-2 rounded-xl hover:bg-surface-hover disabled:opacity-100 disabled:bg-disabled disabled:text-disabled-ink disabled:border-line" onClick={close}><X size={20}/></button></div>
      <div className="relative mx-auto my-5 w-full max-w-[300px] aspect-square overflow-hidden rounded-2xl bg-overlay">
        <canvas ref={canvas} width={512} height={512} aria-label="Profile photo crop preview" className="w-full h-full touch-none cursor-move" onPointerDown={e=>{if(busy)return;e.currentTarget.setPointerCapture(e.pointerId);drag.current={x:e.clientX,y:e.clientY,pan};}} onPointerMove={e=>{if(!drag.current||busy)return;const factor=512/e.currentTarget.getBoundingClientRect().width;setPan([drag.current.pan[0]+(e.clientX-drag.current.x)*factor,drag.current.pan[1]+(e.clientY-drag.current.y)*factor]);}} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}/>
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-full border-2 border-line/90" style={{boxShadow:'0 0 0 100px rgb(15 23 42 / 55%)'}}/>
      </div>
      <div className="space-y-3 text-left">{[['Zoom',zoom,1,3,0.01,v=>{setZoom(v);setPan([0,0]);}],['Horizontal position',pan[0],-1024,1024,1,v=>setPan([v,pan[1]])],['Vertical position',pan[1],-1024,1024,1,v=>setPan([pan[0],v])]].map(([label,value,min,max,step,change])=><label key={label} className="flex items-center gap-3 text-sm text-ink-secondary"><span className="w-36 shrink-0">{label}</span><input type="range" aria-label={label} min={min} max={max} step={step} value={value} disabled={busy} onChange={e=>change(Number(e.target.value))} className="w-full min-w-0 accent-action"/></label>)}</div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">{[['Rotate left',RotateCcw,()=>{setRotation(rotation-90);setPan([0,0]);}],['Rotate right',RotateCw,()=>{setRotation(rotation+90);setPan([0,0]);}],['Flip H',FlipHorizontal,()=>setFlip([-flip[0],flip[1]])],['Flip V',FlipVertical,()=>setFlip([flip[0],-flip[1]])]].map(([label,Icon,action])=><button key={label} type="button" disabled={busy} className={button} onClick={action}><Icon size={16}/>{label}</button>)}</div>
      {error&&image&&<p role="alert" className="mt-4 text-sm text-danger text-left">{error}</p>}
      <div className="flex justify-end gap-3 border-t border-line mt-5 pt-4"><button type="button" disabled={busy} className="btn" onClick={close}>Cancel</button><button type="button" disabled={busy||!image} className="btn btn-primary" onClick={save}>{busy?'Saving photo…':'Use photo'}</button></div>
    </dialog>
  </div>;
}
