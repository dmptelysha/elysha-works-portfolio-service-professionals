import {showBookingThankYou} from '../thank-you/thank-you.mjs';
import {runtimeConfig} from '../booking/booking-config.mjs';
import {configuredApi} from '../booking/booking-api.mjs';
import {createBookingController} from '../booking/booking-model.mjs';
import {element,button,bookingPolicy,calendarPicker,localTimeZone,summary,message,supportLink} from '../booking/booking-ui.mjs';

export const RHEA_FIELDS=[
 {key:'first',label:'First Name',question:'What’s your first name?',required:true,max:80,autocomplete:'given-name'},
 {key:'last',label:'Last Name',question:'And your last name?',required:true,max:80,autocomplete:'family-name'},
 {key:'email',label:'Email',question:'Which email should receive your booking details?',required:true,max:254,autocomplete:'email',type:'email'},
 {key:'organization',label:'Organization / Business Name',question:'What’s your organization or business called?',required:false,max:160,autocomplete:'organization'},
 {key:'business',label:'Business Field',question:'What field is your business in?',required:true,max:160},
 {key:'challenge',label:'Biggest Challenge Right Now',question:'What’s your biggest challenge right now?',required:true,max:2000,multiline:true,help:'Share the bottlenecks, repetitive tasks, or workflow gaps currently costing you time or revenue.'},
 {key:'outcome',label:'Desired Outcome',question:'What would a successful outcome look like?',required:false,max:2000,multiline:true,help:'Tell me what a successful outcome would look like and which goals you want automation to support.'}
];
const notice='Continuing saves your answers in Elysha’s CRM before you choose a time, even if you do not finish booking. Elysha can prepare and follow up about your enquiry. This does not subscribe you to marketing emails. Non-client enquiry records are reviewed for deletion three calendar months after your last interaction.';

/** Booking answers stay here, separate from the ordinary intent engine and fallback events. */
export function mountRheaBooking({root,onReturn,bookingUrl='/booking/?source=rhea'}){
 const config=runtimeConfig();let apiPromise;
 const getApi=()=>apiPromise??=configuredApi(config).catch(error=>{apiPromise=null;throw error;});
 const api=Object.fromEntries(['submit','correct','availability','confirm','status'].map(name=>[name,async(...args)=>(await getApi())[name](...args)]));
 const controller=createBookingController({api,reviewAnswers:true});
 let view='choice',question=0,draft=Object.fromEntries(RHEA_FIELDS.map(f=>[f.key,''])),editField=null,editValue='',resumeView='flow',submitted=false,lastFocusKey='',focusIntent=null;
 const scroll=root.closest('[data-rhea-scroll]');
 root.className='rhea-booking';root.setAttribute('aria-label','Book a discovery call with Rhea');
 const heading=text=>root.append(element('h2',text,{id:'rhea-booking-title',tabindex:'-1'}));
 const paragraph=(text,attrs={})=>root.append(element('p',text,attrs));
 function actions(...items){const row=element('div',null,{class:'rhea-booking-actions'});row.append(...items);root.append(row);}
 function pause(){const state=controller.snapshot();if(state.busy||state.editPending||state.confirmationUncertain||['pending','confirmed','cancelled'].includes(state.step))return;resumeView=view;view='paused';render();}
 function fieldForm(field,value,onSubmit,label,busy=false){
  const form=element('form',null,{class:'rhea-booking-form'}),id=`rhea-answer-${field.key}`;
  const input=element(field.multiline?'textarea':'input',null,{id,name:field.key,'data-rhea-answer':field.key,maxlength:field.max,...(field.multiline?{rows:4}:{type:field.type??'text'}),...(field.autocomplete?{autocomplete:field.autocomplete}:{})});
  input.value=value;input.required=field.required;input.disabled=busy;
  form.append(element('label',field.label+(field.required?'':' (optional)'),{for:id}),input);
  if(field.help){input.setAttribute('aria-describedby',`${id}-help`);form.append(element('p',field.help,{id:`${id}-help`,class:'rhea-booking-help'}));}
  input.addEventListener('input',()=>{if(editField)editValue=input.value;else draft[field.key]=input.value;});
  const submit=element('button',label,{type:'submit',class:'booking-primary'});submit.disabled=busy;form.append(submit);
  form.addEventListener('submit',event=>{event.preventDefault();if(!form.reportValidity()||busy)return;onSubmit(input.value.trim());});root.append(form);
  return input;
 }
 function allAnswers(answers){const dl=element('dl',null,{class:'rhea-booking-answers'});for(const field of RHEA_FIELDS){const row=element('div');row.append(element('dt',field.label),element('dd',answers[field.key]||'Not provided'));dl.append(row);}root.append(dl);}
 async function saveCorrection(){
  const state=controller.snapshot(),answers={...state.answers,[editField.key]:editValue.trim()};
  await controller.correct(answers);
  if(!controller.snapshot().error){editField=null;view='flow';}
  render();
 }
 function render(){
  const state=controller.snapshot(),focused=document.activeElement;
  if(showBookingThankYou(state))return;
  if(root.contains(focused))focusIntent=focused.dataset.calendarDate?{date:focused.dataset.calendarDate}:focused.dataset.calendarAction?{action:focused.dataset.calendarAction}:focused.dataset.rheaAnswer?{field:focused.dataset.rheaAnswer,start:focused.selectionStart,end:focused.selectionEnd}:null;
  else if(focused&&focused!==document.body)focusIntent=null;
  const focusKey=`${view}:${state.step}:${question}:${editField?.key??''}`;
  root.replaceChildren();root.setAttribute('aria-busy',String(state.busy));root.dataset.step=view==='flow'?state.step:view;
  if(config.mode==='emulator')paragraph('Local preview · Synthetic calendar only. No real appointments or emails.',{class:'rhea-booking-test'});
  if(view==='choice'){
   heading('How would you like to book?');paragraph('I can guide you through the project questions and help you choose a discovery call time.');
   const link=element('a','Fill out the form myself',{href:bookingUrl,class:'booking-secondary'});
   actions(button('Book with Rhea',()=>{view='questions';render();},true),link,button('Back to Rhea',onReturn));
  }else if(view==='questions'){
   const field=RHEA_FIELDS[question];paragraph(`About your project · ${question+1} of ${RHEA_FIELDS.length}`,{class:'rhea-booking-progress'});heading(field.question);
   const advance=value=>{draft[field.key]=value;if(question<RHEA_FIELDS.length-1)question++;else view='disclosure';render();};
   fieldForm(field,draft[field.key],advance,'Continue');
   actions(...(!field.required?[button('Skip',()=>advance(''))]:[]),...(question>0?[button('Previous question',()=>{question--;render();})]:[]),button('Not now',pause));
  }else if(view==='disclosure'){
   heading('Ready to choose a time?');paragraph(notice,{class:'rhea-booking-notice'});root.append(bookingPolicy());
   if(state.error)paragraph(message(state.error),{role:'alert'});
   const trap=element('input',null,{name:'website',tabindex:'-1',autocomplete:'off','aria-hidden':'true',class:'rhea-booking-honeypot'});root.append(trap);
   actions(button(state.busy?'Saving your answers…':submitted?'Retry saving answers':'Save answers & show times',async()=>{
    submitted=true;await controller.submit({answers:{...draft},source:'rhea',noticeVersion:'booking-2026-09-03',website:trap.value});
    render();
   },true,state.busy),...(!submitted?[button('Previous question',()=>{view='questions';render();})]:[]),button('Not now',pause,false,state.busy));
  }else if(view==='paused'){
   heading('We can pick this up later.');paragraph('No appointment has been confirmed. Your selected time is not reserved.');
   paragraph(state.step==='questions'?(submitted?'The answer save has not been verified. Resume to retry the same save.':'Your answers stay in this open chat until you save them.'):'Your project answers are saved in Elysha’s CRM.');
   actions(button('Resume booking',()=>{view=resumeView;render();},true),button('Back to Rhea',onReturn));
  }else if(view==='editMenu'){
   heading('Which detail would you like to change?');
   actions(...RHEA_FIELDS.map(field=>button(field.label,()=>{editField=field;editValue=state.answers[field.key]??'';view='editField';render();})),button('Date & time',()=>{view='flow';controller.back();render();}),button('Back to summary',()=>{view='flow';render();}));
  }else if(view==='editField'){
   heading(`Update ${editField.label.toLowerCase()}`);
   if(state.error)paragraph(state.error==='conflict'?'This change could not be saved. Please check the detail or contact support; another enquiry will not reset booking limits.':state.error==='revision-conflict'?'These answers changed in another request. Please contact support before confirming.':message(state.error),{role:'alert'});
   if(state.editPending&&!state.busy){paragraph('I could not verify whether this change was saved. Retry this same change before continuing.');actions(button('Retry saving this change',()=>void saveCorrection(),true));}
   else fieldForm(editField,editValue,value=>{editValue=value;void saveCorrection();},state.busy?'Saving change…':'Save change',state.busy);
   actions(button('Back to summary',()=>{editField=null;view='flow';render();},false,state.busy||state.editPending));
   if(state.error)root.append(supportLink());
  }else{
   if(state.error)paragraph(state.error==='revision-conflict'?'Your saved answers no longer match this review. Please contact support before confirming.':message(state.error),{role:'alert'});
   if(state.step==='times'){
    heading('Let’s find a time for your call.');paragraph('Your project answers are saved. Choose an available 30-minute Google Meet call.');root.append(localTimeZone(state.zone),calendarPicker(state,controller));
    const refresh=button('Refresh times',()=>void controller.loadSlots(),false,state.busy||state.loadingSlots);refresh.dataset.calendarAction='refresh';
    actions(refresh,button('Not now',pause,false,state.busy));paragraph('A time is reserved only after you confirm.',{class:'rhea-booking-help'});
   }else if(state.step==='review'){
    heading('Review your discovery call');paragraph('Here are your project answers and selected time. Is everything right?');
    root.append(summary({...state.selected,displayTimeZone:state.zone}));allAnswers(state.answers);root.append(bookingPolicy());
    if(state.confirmationUncertain)paragraph('I could not verify the confirmation yet. Retry this same request; please do not start another booking.',{role:'status'});
    const locked=state.busy||state.editPending||state.confirmationUncertain;
    actions(button(state.busy?'Checking…':state.confirmationUncertain?'Retry confirmation':'Confirm booking',()=>void controller.confirm(),true,state.busy||state.editPending||state.error==='revision-conflict'),button('Edit details',()=>{view='editMenu';render();},false,locked),button('Not now',pause,false,locked));
   }else if(state.step==='pending'){
    heading('Your booking is still being verified.');paragraph('Please keep this chat open. I’ll only confirm after the calendar verifies the appointment. Do not start another booking.',{role:'status'});
    actions(button(state.busy?'Checking…':'Check booking status',()=>void controller.poll(),true,state.busy));
   }else if(state.step==='confirmed'){
    heading('Your discovery call is confirmed.');paragraph('Your discovery call is confirmed. Please check your email for the Google Meet link and booking details.',{role:'status'});root.append(summary(state.result.booking));actions(button('Back to Rhea',onReturn));
   }else if(state.step==='cancelled'){
    heading('This booking is cancelled.');paragraph('Contact support if you need help with your enquiry.');root.append(supportLink());
   }
   if(state.error)root.append(supportLink());
  }
  if(focusKey!==lastFocusKey){lastFocusKey=focusKey;focusIntent=null;if(scroll)scroll.scrollTop=0;focus();}
  else if(focusIntent&&!state.busy){
   const target=focusIntent.field?root.querySelector(`[data-rhea-answer="${focusIntent.field}"]`):focusIntent.date?root.querySelector(`[data-calendar-date="${focusIntent.date}"]`):root.querySelector(`[data-calendar-action="${focusIntent.action}"]`);
   if(target&&!target.disabled){target.focus({preventScroll:true});if(focusIntent.field&&target.type!=='email')target.setSelectionRange?.(focusIntent.start,focusIntent.end);}
   else if(!state.loadingSlots)root.querySelector('.calendar-header h3')?.focus({preventScroll:true});
  }
 }
 function focus(){(root.querySelector('input:not([aria-hidden]):not(:disabled),textarea:not(:disabled)')??root.querySelector('h2'))?.focus({preventScroll:true});}
 controller.subscribe(state=>{if(view==='disclosure'&&state.step!=='questions')view='flow';render();});
 render();return {focus,resume(){root.hidden=false;render();focus();},snapshot:controller.snapshot};
}
