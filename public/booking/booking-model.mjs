import {dateKey,monthBounds,monthRanges} from './booking-calendar.mjs';
export function createBookingController({api,now=Date.now,newId=()=>crypto.randomUUID(),reviewAnswers=false}){
 const listeners=new Set();let session=null,submitBody='',submitKey='',confirmKey='',confirmZone='',confirmAttempted=false,availabilityError='';
 const zone=Intl.DateTimeFormat().resolvedOptions().timeZone||'Asia/Manila';
 let correctionBody='',correctionKey='';
 let state={step:'questions',answers:{},slots:[],selected:null,selectedDate:null,zone,month:dateKey(now(),zone).slice(0,7),busy:false,loadingSlots:false,error:'',result:null,from:now(),revision:1,editPending:false,confirmationUncertain:false};
 const emit=()=>listeners.forEach(f=>f(structuredClone(state)));const set=patch=>{state={...state,...patch};emit();};const failure=e=>e instanceof Error?e.message:'unavailable';
 async function loadSlots(month){
  if(!session)throw Error('unauthorized');if(state.busy||state.loadingSlots)return;
  const bounds=monthBounds(now(),state.zone);month??=state.month<bounds.first?bounds.first:state.month>bounds.last?bounds.last:state.month;if(month<bounds.first||month>bounds.last)throw Error('invalid');
  const ranges=monthRanges(month,now()),previousDate=state.selectedDate;
  availabilityError='';set({busy:true,loadingSlots:true,error:'',month,from:ranges[0]?.from??now(),slots:[],selectedDate:null});
  try{
   // Publish only returned, verified slots. A slow independent range must not
   // block a usable date, but refresh/navigation waits for every request.
   const results=await Promise.allSettled(ranges.map(async({from,to})=>{
    const result=await api.availability(session.token,from,to);
    if(!availabilityError){
     const slots=[...new Map([...state.slots,...result.slots.filter(s=>s.start>=from&&s.start<to)].filter(s=>dateKey(s.start,state.zone).startsWith(month)).map(s=>[s.start,s])).values()].sort((a,b)=>a.start-b.start);
     const dates=new Set(slots.map(s=>dateKey(s.start,state.zone)));
     set({slots,selectedDate:dates.has(state.selectedDate)?state.selectedDate:dates.has(previousDate)?previousDate:dates.values().next().value??null,...(state.step==='times'&&slots.length?{busy:false}:{})});
    }
    return result;
   }));
   const failed=results.find(result=>result.status==='rejected');if(failed)throw failed.reason;
  }catch(e){availabilityError=failure(e);set({slots:[],selectedDate:null,...(state.step==='times'?{error:availabilityError}:{})});}finally{set({loadingSlots:false,...(state.step==='times'?{busy:false}:{})});}
 }
 function accept(result){if(!result?.booking?.id)throw Error('unavailable');const status=result.booking.status;set({result,confirmationUncertain:false,step:status==='confirmed'?'confirmed':['pending','recovering'].includes(status)?'pending':status==='cancelled'?'cancelled':'times',error:status==='failed'?'conflict':''});}
 return {snapshot:()=>structuredClone(state),subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
  async submit(input){if(state.busy)return;const body=JSON.stringify(input);if(reviewAnswers&&submitBody&&body!==submitBody)throw Error('invalid');if(body!==submitBody){submitKey=newId();submitBody=body;}set({busy:true,error:'',answers:{...input.answers}});try{session=await api.submit(input,submitKey);set({step:'times',busy:false});await loadSlots();}catch(e){set({busy:false,error:failure(e),step:'questions'});}},loadSlots,
  async correct(answers){
   if(state.busy)return;
   if(!reviewAnswers||!session||state.step!=='review'||state.confirmationUncertain)throw Error('invalid');
   const body=JSON.stringify(answers);
   if(state.editPending&&body!==correctionBody)throw Error('invalid');
   if(!state.editPending){correctionBody=body;correctionKey=newId();}
   set({busy:true,error:'',editPending:true});
   try{const result=await api.correct(session.token,answers,state.revision,correctionKey);if(result.revision!==state.revision+1)throw Error('unavailable');confirmKey=newId();confirmAttempted=false;set({answers:{...answers},revision:result.revision,editPending:false});}
   catch(e){const code=failure(e);set({error:code,editPending:!['invalid','conflict','revision-conflict','expired','unauthorized','forbidden','rate-limited'].includes(code)});}
   finally{set({busy:false});}
  },
  async changeMonth(month){if(state.step!=='times')throw Error('invalid');await loadSlots(month);},
  async setZone(zone){if(state.busy||state.loadingSlots||state.step!=='times')return;new Intl.DateTimeFormat('en',{timeZone:zone});const bounds=monthBounds(now(),zone);set({zone,selectedDate:null});await loadSlots(state.month<bounds.first?bounds.first:state.month>bounds.last?bounds.last:state.month);},
  selectDate(date){if(state.busy||state.step!=='times'||!state.slots.some(s=>dateKey(s.start,state.zone)===date))throw Error('invalid');set({selectedDate:date,error:''});},
  choose(start,zone){if(state.busy||state.step!=='times')throw Error('invalid');new Intl.DateTimeFormat('en',{timeZone:zone});const selected=state.slots.find(s=>s.start===start);if(!selected)throw Error('invalid');if(state.selected?.start!==start||confirmZone!==zone){confirmKey=newId();confirmZone=zone;confirmAttempted=false;}set({selected,zone,step:'review',error:''});},
  back(){if(!state.busy&&state.step==='review'&&!(reviewAnswers&&(state.editPending||state.confirmationUncertain)))set({step:'times',error:availabilityError});},
  async confirm(){if(state.busy)return;if(state.step!=='review'||!session||!state.selected||state.editPending)throw Error('invalid');set({busy:true,error:''});try{if(!confirmAttempted){const latest=await api.availability(session.token,state.selected.start,state.selected.start+1800000);if(!latest.slots.some(s=>s.start===state.selected.start))throw Error('conflict');}confirmAttempted=true;accept(await api.confirm(session.token,state.selected.start,state.zone,confirmKey,...(reviewAnswers?[state.revision]:[])));}catch(e){const code=failure(e);if(code==='conflict')confirmAttempted=false;set({error:code,confirmationUncertain:reviewAnswers&&confirmAttempted,...(code==='conflict'?{step:'times',selected:null,result:null}:{})});}finally{set({busy:false});}},
  async poll(){if(state.busy||state.step!=='pending'||!session||!state.result?.booking.id)return;set({busy:true,error:''});try{accept(await api.status(session.token,state.result.booking.id));}catch(e){set({error:failure(e)});}finally{set({busy:false});}}
 };
}
