type HasDish={dishes:{name:string}[]};
const dishKey=(name:string)=>name.normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('vi').replace(/đ/g,'d').trim().replace(/\s+/g,' ');

export function diversePages<T extends HasDish>(items:T[],size=4):T[][]{
 if(!Number.isInteger(size)||size<1)throw Error('Kích thước nhóm không hợp lệ.');
 const groups=new Map<string,{items:T[],next:number}>();
 for(const item of items){const key=dishKey(item.dishes[0].name);let group=groups.get(key);if(!group){group={items:[],next:0};groups.set(key,group);}group.items.push(item);}
 const queues=[...groups.values()],pages:T[][]=[];
 let cursor=0,remaining=items.length;
 while(remaining>0){
  const page:T[]=[];
  // At most one restaurant from each dish bucket per page; rotate dishes between pages.
  for(let scanned=0;scanned<queues.length&&page.length<size;scanned++){
   const queue=queues[cursor];cursor=(cursor+1)%queues.length;
   if(queue.next<queue.items.length){page.push(queue.items[queue.next++]);remaining--;}
  }
  pages.push(page);
 }
 return pages;
}
