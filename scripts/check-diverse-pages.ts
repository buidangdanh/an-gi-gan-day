import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {diversePages} from '../apps/web/app/diverse-pages';
const rows=JSON.parse(readFileSync('data/imports/ha-noi-2026-11-17/restaurants.json','utf8')).records.map((r:any)=>({id:r.record_id,dishes:[{name:r.category}]}));
const before=JSON.stringify(rows);const pages=diversePages(rows);
assert.equal(pages.length,100);
for(const page of pages){assert.equal(page.length,4);assert.equal(new Set(page.map((r:any)=>r.dishes[0].name)).size,4);}
assert.equal(new Set(pages.flat().map((r:any)=>r.id)).size,400);
assert.equal(JSON.stringify(rows),before);
assert.deepEqual(diversePages([]),[]);
const fewer=diversePages([{dishes:[{name:'Phở bò'}]},{dishes:[{name:'PHỞ BÒ'}]},{dishes:[{name:'Bún chả'}]}]);
assert.deepEqual(fewer.map(p=>p.length),[2,1]);
console.log('PASS: 100 lượt × 4 món khác nhau, đủ 400 quán không trùng ID; tên món không phân biệt hoa/thường, không sửa dữ liệu nguồn.');
