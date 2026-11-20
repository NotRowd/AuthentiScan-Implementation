// Both endpoints share a single CPU model. Serialize requests from this backend
// rather than sending overlapping inference that the model rejects as busy.
// Bound the queue and waiting time; never retry inference or invent a response.
export function createVisualReviewQueue({maxQueued=4,waitMs=60000}={}){
  let active=false;
  const waiting=[];
  function release(){
    const next=waiting.shift();
    if(next){clearTimeout(next.timer);next.resolve();}
    else active=false;
  }
  return async function run(task){
    if(active){
      if(waiting.length>=maxQueued)throw Object.assign(new Error('Visual review queue is full. Wait and retry.'),{code:'VISUAL_BUSY'});
      await new Promise((resolve,reject)=>{
        const entry={resolve,timer:null};
        entry.timer=setTimeout(()=>{
          const index=waiting.indexOf(entry);
          if(index>=0)waiting.splice(index,1);
          reject(Object.assign(new Error('Visual review queue wait timed out. Wait and retry.'),{code:'VISUAL_BUSY'}));
        },waitMs);
        waiting.push(entry);
      });
    }else active=true;
    try{return await task();}finally{release();}
  };
}
export const runVisualReview=createVisualReviewQueue();
