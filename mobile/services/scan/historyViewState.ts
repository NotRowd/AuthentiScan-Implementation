import type {ScanResult} from '../../types';
import type {HistoryFilters,HistoryStatus} from './historyFilters';
import {onSessionCleared} from '../api/session';

export type HistoryViewState={search:string;status:HistoryStatus;filters:HistoryFilters;scans:ScanResult[];total:number;offset:number;scrollY:number};
const views=new Map<string,HistoryViewState>();let revision=0;
export const historyViewRevision=()=>revision;
export function clearHistoryViews(){views.clear();revision++;}
onSessionCleared(clearHistoryViews);
export function readHistoryView(owner:string|undefined):HistoryViewState {
 const view=owner?views.get(owner):undefined;
 return view?{...view,filters:{...view.filters},scans:[...view.scans]}:{search:'',status:'all',filters:{q:'',status:'all'},scans:[],total:0,offset:0,scrollY:0};
}
export function saveHistoryView(owner:string|undefined,view:HistoryViewState,expectedRevision:number){
 if(!owner||expectedRevision!==revision)return;
 views.set(owner,{...view,filters:{...view.filters},scans:[...view.scans],scrollY:Math.max(0,view.scrollY)});
}
