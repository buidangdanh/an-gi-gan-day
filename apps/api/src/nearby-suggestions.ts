type Candidate={id:string,primary_group:string,distance:number};

// Each round takes the nearest remaining restaurant from four distinct groups.
// Advancing only the chosen groups keeps later rounds local as well.
export function nearbySuggestionPage<T extends Candidate>(candidates:T[],page:number){
 const queues=new Map<string,{items:T[],index:number}>();
 for(const candidate of candidates){
  let queue=queues.get(candidate.primary_group);
  if(!queue){queue={items:[],index:0};queues.set(candidate.primary_group,queue);}
  queue.items.push(candidate);
 }
 const compare=(a:T,b:T)=>a.distance-b.distance||a.id.localeCompare(b.id);
 for(const queue of queues.values())queue.items.sort(compare);
 let items:T[]=[];
 for(let round=0;round<=page;round++){
  const heads=[...queues.values()].filter(q=>q.index<q.items.length).sort((a,b)=>compare(a.items[a.index],b.items[b.index])).slice(0,4);
  if(!heads.length)return {items:[] as T[],hasMore:false};
  items=heads.map(q=>q.items[q.index++]);
 }
 return {items,hasMore:[...queues.values()].some(q=>q.index<q.items.length)};
}
