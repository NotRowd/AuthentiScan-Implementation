const assert=require('node:assert/strict'),{harness,pure}=require('./targeted-ui-harness.cjs');
(async()=>{
const filters=pure('services/scan/historyFilters.ts',()=>({}),{URLSearchParams});assert.deepEqual(Array.from(filters.HISTORY_FILTER_CHOICES,x=>x[0]),['all','failed','authentic','ai_generated','uncertain']);
for(const status of ['queued','processing','completed'])assert.ok(filters.historyQuery(0,20,{status}).includes('status='+status),'API lifecycle support remains');
for(const dark of [false,true]){
const calls=[],ui=harness('app/(tabs)/dashboard.tsx',{dark,auth:{user:{id:'owner-a'}},history:{getStats:async()=>({total_scans:83,queued_scans:3,ai_generated_found:30,scans_remaining:null,plan:{scan_limit:null}}),getPage:async(offset,limit,filter={})=>{calls.push({offset,limit,filter});return {scans:[],pagination:{total:filter.status==='authentic'?47:83,offset,limit}};}}});ui.render();await ui.flush();ui.focus();await ui.flush();assert.ok(calls.some(c=>c.limit===1&&c.filter.status==='authentic'));assert.equal(ui.all(n=>n.props.children==='Authentic').length,1);assert.equal(ui.all(n=>n.props.children===47).length,1);assert.equal(ui.all(n=>n.props.children==='Queued scans').length,0);
}
console.log('PASS simplified mobile filter choices, preserved lifecycle contracts and exact server Authentic dashboard count in both themes.');
})().catch(e=>{console.error(e);process.exitCode=1;});
