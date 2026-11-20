import {useState} from 'react';
export default function Avatar({user,initials}){
  const [failed,setFailed]=useState(null);
  const src=user?.avatar_url;
  return src&&src!==failed?<img src={src} alt="Your profile photo" className="w-full h-full rounded-full object-cover" onError={()=>setFailed(src)}/>:initials;
}
