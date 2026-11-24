import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mapsUrl} from '../src/domain';

test('visit opens a coordinate pin without requesting directions',()=>{
 const url=new URL(mapsUrl({lat:21.0285,lng:105.8542,address:'Hà Nội'}));
 assert.equal(url.origin,'https://www.google.com');
 assert.equal(url.pathname,'/maps/search/');
 assert.equal(url.searchParams.get('api'),'1');
 assert.equal(url.searchParams.get('query'),'21.0285,105.8542');
 assert.equal(url.searchParams.has('destination'),false);
 assert.equal(url.searchParams.has('origin'),false);
 assert.equal(url.searchParams.has('dir_action'),false);
});
test('missing or incomplete coordinates use the full Vietnamese address',()=>{
 const address='49 Bát Đàn, P. Cửa Đông, Hà Nội';
 for(const coordinates of [{lat:null,lng:null},{lat:21,lng:null},{lat:null,lng:105}]){
  const url=new URL(mapsUrl({...coordinates,address}));
  assert.equal(url.pathname,'/maps/search/');
  assert.equal(url.searchParams.get('query'),address);
 }
});
