// Reserve the tab during the click, before the API request loses user activation.
export async function withMapTab<T>(request:()=>Promise<T>,getUrl:(result:T)=>string|undefined):Promise<T>{
 const mapTab=window.open('about:blank','_blank');
 if(!mapTab)throw new Error('Trình duyệt đang chặn tab mới. Hãy cho phép mở tab rồi thử lại.');
 try{
  mapTab.opener=null;
  mapTab.document.title='Đang mở vị trí quán…';
  mapTab.document.body.textContent='Đang mở vị trí quán trên Google Maps…';
  const result=await request();
  const url=getUrl(result);
  if(url)mapTab.location.replace(url);
  else mapTab.close();
  return result;
 }catch(error){mapTab.close();throw error;}
}
