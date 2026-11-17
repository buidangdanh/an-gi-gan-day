import {normalize} from './domain';
const clean=(s:string)=>normalize(s).replace(/[^\p{L}\p{N}/]+/gu,' ').trim().replace(/\s+/g,' ');
const street=(s:string)=>clean(s).replace(/^(pho|duong) /,'');
export function chooseAddressLocation(row:{name:string,address:string},features:any[]){
 const first=row.address.split(',')[0].trim();
 const match=first.match(/^(?:số\s+)?(\d+[a-zA-Z]?(?:\/\d+[a-zA-Z]?)*)\s+(.+)$/i);
 const candidates=features.flatMap(f=>{
  const p=f.properties||{},c=f.geometry?.coordinates;
  if(!Array.isArray(c)||c.length!==2||!Number.isFinite(c[0])||!Number.isFinite(c[1])||c[0]<105.2||c[0]>106.2||c[1]<20.6||c[1]>21.5||p.countrycode?.toUpperCase()!=='VN')return [];
  if(!/(^| )(ha noi|hanoi)( |$)/.test(clean([p.city,p.state,p.county].filter(Boolean).join(' '))))return [];
  const exactHouse=match&&p.housenumber&&clean(match[1])===clean(String(p.housenumber))&&street(match[2])===street(p.street||'');
  const exactName=(!match||!p.housenumber)&&clean(row.name)===clean(p.name||'')&&p.street&&street(first).includes(street(p.street));
  if(!exactHouse&&!exactName)return [];
  return [{lat:c[1] as number,lng:c[0] as number,precision:exactHouse?'osm_address':'osm_poi',osm_type:p.osm_type,osm_id:p.osm_id}];
 });
 if(!candidates.length)return {status:features.length?'needs_review':'not_found',location:null};
 const firstCandidate=candidates[0];
 // OSM may contain a house polygon and POI node at the same address. Accept only a tight cluster.
 const spread=candidates.some(c=>Math.hypot((c.lat-firstCandidate.lat)*111320,(c.lng-firstCandidate.lng)*111320*Math.cos(firstCandidate.lat*Math.PI/180))>30);
 if(spread)return {status:'ambiguous',location:null};
 return {status:'matched_address',location:candidates[0]};
}
