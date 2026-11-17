export type Point={lat:number,lng:number};
export function currentDistanceMeters(origin:Point,target:{lat:number|null,lng:number|null}):number|null{
 if(target.lat===null||target.lng===null)return null;
 const numbers=[origin.lat,origin.lng,target.lat,target.lng];
 if(numbers.some(n=>!Number.isFinite(n))||Math.abs(origin.lat)>90||Math.abs(target.lat)>90||Math.abs(origin.lng)>180||Math.abs(target.lng)>180)return null;
 const rad=(n:number)=>n*Math.PI/180;
 const dLat=rad(target.lat-origin.lat),dLng=rad(target.lng-origin.lng);
 const a=Math.min(1,Math.max(0,Math.sin(dLat/2)**2+Math.cos(rad(origin.lat))*Math.cos(rad(target.lat))*Math.sin(dLng/2)**2));
 return Math.round(6371008.8*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a)));
}
