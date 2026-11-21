/* Synchronous theme restoration before styles and React. */
(function () {
 var key='authentiscan.appearance.v1',root=document.documentElement,error='';
 function valid(value){return value==='light'||value==='dark';}
 var preference=valid(root.dataset.theme)?root.dataset.theme:(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
 try{var saved=localStorage.getItem(key);if(valid(saved))preference=saved;}catch(_){}
 function save(){try{localStorage.setItem(key,preference);error='';}catch(_){error='Theme changed for this session. Could not save it on this device.';}}
 // Resolve legacy System once. No OS change listener remains.
 save();
 function apply(){root.dataset.theme=preference;root.style.colorScheme=preference;root.style.backgroundColor=preference==='dark'?'#091321':'#f6f9fc';var meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content=root.style.backgroundColor;window.dispatchEvent(new Event('authentiscan-theme-change'));}
 window.AuthentiScanTheme=Object.freeze({getPreference:function(){return preference;},getSaveError:function(){return error;},setPreference:function(next){if(!valid(next))return;preference=next;save();apply();}});
 window.addEventListener('storage',function(event){if(event.key!==key&&event.key!==null)return;if(valid(event.newValue)){preference=event.newValue;error='';}else save();apply();});
 apply();
})();
