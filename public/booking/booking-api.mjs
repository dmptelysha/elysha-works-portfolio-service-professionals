export function validateConfig(config,hostname=globalThis.location?.hostname){
 const local=['127.0.0.1','localhost'].includes(hostname);
 if(config?.mode==='emulator'&&local&&config.apiBaseUrl==='http://127.0.0.1:5051')return config;
 const nonempty=value=>typeof value==='string'&&value.trim().length>0&&value===value.trim();
 if(config?.mode!=='production'||!['elyshaworks.com','www.elyshaworks.com'].includes(hostname)||config.apiBaseUrl!=='https://crm.elyshaworks.com'||!nonempty(config.appCheckSiteKey)||config.firebaseConfig?.projectId!=='elyshaworks-fd2dc'||!nonempty(config.firebaseConfig?.apiKey)||!/^1:281424869871:web:[a-zA-Z0-9]+$/.test(config.firebaseConfig?.appId??''))throw Error('disconnected');return config;
}
export function createBookingApi(raw,getAppCheck,fetcher=fetch,hostname=globalThis.location?.hostname){
 const config=validateConfig(raw,hostname);
 async function call(path,token,method='GET',body,key){
  let attestation;try{attestation=await getAppCheck();if(typeof attestation!=='string'||!attestation.trim())throw Error();}catch{throw Error('unavailable');}
  const headers={'X-Firebase-AppCheck':attestation,'Content-Type':'application/json'};if(token)headers.Authorization=`Bearer ${token}`;if(key)headers['Idempotency-Key']=key;
  let response;try{response=await fetcher(`${config.apiBaseUrl}/v1${path}`,{method,headers,cache:'no-store',referrerPolicy:'no-referrer',credentials:'omit',redirect:'error',signal:AbortSignal.timeout(45000),...(body===undefined?{}:{body:JSON.stringify(body)})});}catch{throw Error('unavailable');}
  let data;try{data=await response.json();}catch{throw Error('unavailable');}if(!response.ok)throw Error(data.error?.code??'unavailable');return data;
 }
 return {submit:(input,key)=>call('/intakes',null,'POST',input,key),correct:(token,answers,revision,key)=>call('/intakes/current',token,'PATCH',{answers,revision},key),availability:(token,from,to)=>call(`/availability?from=${from}&to=${to}`,token),confirm:(token,start,displayTimeZone,key,intakeRevision)=>call('/bookings',token,'POST',{start,displayTimeZone,...(intakeRevision===undefined?{}:{intakeRevision})},key),status:(token,id)=>call(`/bookings/${encodeURIComponent(id)}`,token),manage:token=>call('/manage',token),manageAvailability:(token,from,to)=>call(`/manage/availability?from=${from}&to=${to}`,token),reschedule:(token,start,displayTimeZone,key)=>call('/manage/reschedule',token,'POST',{start,displayTimeZone},key),cancel:(token,key)=>call('/manage/cancel',token,'POST',{},key)};
}
export async function configuredApi(config){
 validateConfig(config);if(config.mode==='emulator')return createBookingApi(config,async()=> 'local-emulator-only');
 const [{initializeApp},{initializeAppCheck,ReCaptchaEnterpriseProvider,getToken}]=await Promise.all([import('https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js'),import('https://www.gstatic.com/firebasejs/12.0.0/firebase-app-check.js')]);
 const app=initializeApp(config.firebaseConfig,'elysha-booking');const check=initializeAppCheck(app,{provider:new ReCaptchaEnterpriseProvider(config.appCheckSiteKey),isTokenAutoRefreshEnabled:true});return createBookingApi(config,async()=>{try{return (await getToken(check)).token;}catch{throw Error('unavailable');}});
}
