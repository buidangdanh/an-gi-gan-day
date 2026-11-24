import {test} from 'node:test';
import assert from 'node:assert/strict';
import {nearbySuggestionPage} from '../src/nearby-suggestions';

const row=(id:string,primary_group:string,distance:number)=>({id,primary_group,distance});
test('selects nearby groups before distant popular groups, keeping close duplicates for later',()=>{
 const rows=[row('far','phở bò',9000),row('a2','cơm',20),row('a1','cơm',10),row('b','bún',30),row('c','cháo',40),row('d','xôi',50),row('b2','bún',60),row('c2','cháo',70)];
 const first=nearbySuggestionPage(rows,0),second=nearbySuggestionPage(rows,1);
 assert.deepEqual(first.items.map(r=>r.id),['a1','b','c','d']);
 assert.deepEqual(second.items.map(r=>r.id),['a2','b2','c2','far']);
 assert.equal(first.hasMore,true);assert.equal(second.hasMore,false);
 for(const page of [first,second])assert.equal(new Set(page.items.map(r=>r.primary_group)).size,page.items.length);
});
test('ties are stable; depleted pages return no duplicates',()=>{
 const rows=[row('b','bún',10),row('a','cơm',10)];
 assert.deepEqual(nearbySuggestionPage(rows,0).items.map(r=>r.id),['a','b']);
 assert.deepEqual(nearbySuggestionPage(rows,1),{items:[],hasMore:false});
 assert.deepEqual(nearbySuggestionPage([],0),{items:[],hasMore:false});
});
