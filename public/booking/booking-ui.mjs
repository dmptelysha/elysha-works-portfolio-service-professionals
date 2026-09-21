import {projectIntent,projectIntake} from './booking-project.mjs';
import {runtimeConfig} from './booking-config.mjs';import {configuredApi,validateConfig} from './booking-api.mjs';import {createBookingController} from './booking-model.mjs';
import {showBookingThankYou} from '../thank-you/thank-you.mjs';
import {dateKey,monthDate,monthDays,monthBounds,shiftMonth} from './booking-calendar.mjs';
export function element(tag,text,attributes={}){const node=document.createElement(tag);if(text!==null&&text!==undefined)node.textContent=text;for(const [key,value]of Object.entries(attributes))node.setAttribute(key,String(value));return node;}
export function button(text,action,primary=false,disabled=false){const node=element('button',text,{type:'button',class:primary?'booking-primary':'booking-secondary'});node.disabled=disabled;node.addEventListener('click',action);return node;}
export function message(code,context='booking'){
 if(code==='conflict')return context==='manage'?'This change could not be completed. The time may be unavailable, or the enquiry may not meet the two-hour notice or one-reschedule rule. Refresh your booking status or contact support.':'That time may be no longer available, or this enquiry may not be eligible for another call. Refresh the times or contact support; submitting another form does not reset the reschedule allowance.';
 return ({disconnected:'Scheduling is temporarily unavailable. No appointment has been confirmed. Please try again later.',expired:'Your booking session expired. Reload this page to start again.',unauthorized:'This booking session is no longer available. Please open your original link or start again.',forbidden:'Unable to verify this request. Please reload and try again.','rate-limited':'Too many requests. Please wait a moment before trying again.',invalid:'Please check the required fields and try again.'})[code]??'We could not verify the result. Please retry the same request; do not create another booking.';
}
export function bookingPolicy(){
 const note=element('div',null,{class:'booking-policy'});
 note.append(element('p','Free 30-minute Google Meet call. One reschedule per enquiry, with at least two hours’ notice and subject to availability. Cancellation is allowed at any time; late cancellation does not qualify for a replacement.'));
 const local=['127.0.0.1','localhost'].includes(location.hostname),suffix=local?'.html':'/';
 const links=element('p');links.append(element('a','Privacy Policy',{href:`/elysha-works-privacy-policy${suffix}`,target:'_blank',rel:'noopener noreferrer'}),' · ',element('a','Terms of Service',{href:`/elysha-works-terms-of-service${suffix}`,target:'_blank',rel:'noopener noreferrer'}));note.append(links);return note;
}
export function supportLink(){return element('a','Contact support',{href:'mailto:support@elyshaworks.com'});}
export const dateTime=(instant,zone)=>new Intl.DateTimeFormat('en',{timeZone:zone,dateStyle:'full',timeStyle:'short'}).format(instant);
export function summary(booking){const dl=element('dl',null,{class:'booking-summary'});for(const [label,value]of [['Date & time',dateTime(booking.start,booking.displayTimeZone)],['Time zone',booking.displayTimeZone],['Duration','30 minutes'],['Location','Google Meet']]){const row=element('div');row.append(element('dt',label),element('dd',value));dl.append(row);}return dl;}
export function zoneSelect(value,onChange){const label=element('label','Your time zone',{class:'booking-field'});const select=element('select',null,{class:'booking-zone','aria-label':'Your time zone'});const zones=[...new Set([value,'Asia/Manila',...(Intl.supportedValuesOf?.('timeZone')??['UTC','America/New_York','Europe/London'])])];for(const zone of zones){const option=element('option',zone,{value:zone});option.selected=zone===value;select.append(option);}select.addEventListener('change',()=>onChange(select.value));label.append(select);return label;}
export function localTimeZone(zone){return element('p',`Your local time · ${zone} (detected from your device)`,{class:'calendar-zone','data-local-time-zone':zone});}
export function slotList(slots,zone,onChoose,busy=false){const fragment=document.createDocumentFragment();const grouped=new Map();for(const slot of slots){const day=new Intl.DateTimeFormat('en',{timeZone:zone,weekday:'long',month:'long',day:'numeric',year:'numeric'}).format(slot.start);if(!grouped.has(day))grouped.set(day,[]);grouped.get(day).push(slot);}for(const [day,items]of grouped){fragment.append(element('h3',day,{class:'booking-day'}));const grid=element('div',null,{class:'booking-slots'});for(const slot of items){const text=new Intl.DateTimeFormat('en',{timeZone:zone,timeStyle:'short'}).format(slot.start);const b=button(text,()=>onChoose(slot.start),false,busy);b.setAttribute('aria-label',`${day}, ${text}`);grid.append(b);}fragment.append(grid);}return fragment;}
function monthArrow(label,direction,action,disabled){
 const b=button('',action,false,disabled);b.className='calendar-arrow';b.setAttribute('aria-label',label);b.dataset.calendarAction=direction;
 // Phosphor caret-left / caret-right, retrieved with the project better-icons skill.
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 256 256');svg.setAttribute('aria-hidden','true');
 const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('fill','currentColor');path.setAttribute('d',direction==='previous'?'M165.66 202.34a8 8 0 0 1-11.32 11.32l-80-80a8 8 0 0 1 0-11.32l80-80a8 8 0 0 1 11.32 11.32L91.31 128Z':'m181.66 133.66l-80 80a8 8 0 0 1-11.32-11.32L164.69 128L90.34 53.66a8 8 0 0 1 11.32-11.32l80 80a8 8 0 0 1 0 11.32');svg.append(path);b.append(svg);return b;
}
export function calendarPicker(state,controller){
 const layout=element('div',null,{class:'booking-calendar-layout'}),calendar=element('div',null,{class:'booking-calendar'});
 const label=new Intl.DateTimeFormat('en',{timeZone:'UTC',month:'long',year:'numeric'}).format(monthDate(state.month));
 const bounds=monthBounds(Date.now(),state.zone),header=element('div',null,{class:'calendar-header'}),nav=element('div',null,{class:'calendar-nav'});
 nav.append(monthArrow('Previous month','previous',()=>void controller.changeMonth(shiftMonth(state.month,-1)),state.busy||state.loadingSlots||state.month<=bounds.first),monthArrow('Next month','next',()=>void controller.changeMonth(shiftMonth(state.month,1)),state.busy||state.loadingSlots||state.month>=bounds.last));
 header.append(element('h3',label,{tabindex:'-1'}),nav);calendar.append(header);
 const table=element('table',null,{class:'calendar-grid','aria-label':label}),head=element('thead'),headRow=element('tr');
 for(const day of ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']){const th=element('th',null,{scope:'col'});th.append(element('abbr',day.slice(0,3),{title:day}));headRow.append(th);}head.append(headRow);table.append(head);
 const body=element('tbody'),{offset,days}=monthDays(state.month),available=new Set(state.slots.map(s=>dateKey(s.start,state.zone))),today=dateKey(Date.now(),state.zone);
 for(let i=0;i<Math.ceil((offset+days.length)/7)*7;i+=7){const row=element('tr');for(let j=0;j<7;j++){
  const cell=element('td'),date=days[i+j-offset];
  if(date){const enabled=available.has(date)&&!state.busy&&!state.error,fullDate=new Intl.DateTimeFormat('en',{timeZone:'UTC',dateStyle:'full'}).format(new Date(`${date}T12:00:00Z`));
   const b=button(String(Number(date.slice(-2))),()=>controller.selectDate(date),false,!enabled);b.className='calendar-date';b.dataset.calendarDate=date;b.setAttribute('aria-pressed',String(state.selectedDate===date));b.setAttribute('aria-label',`${fullDate}, ${enabled?'available':state.loadingSlots?'not yet available':'unavailable'}`);if(date===today)b.setAttribute('aria-current','date');cell.append(b);
  }else cell.setAttribute('aria-hidden','true');row.append(cell);
 }body.append(row);}table.append(body);
 table.addEventListener('keydown',event=>{
  const deltas={ArrowRight:1,ArrowLeft:-1,ArrowDown:7,ArrowUp:-7};const delta=deltas[event.key];if(!delta||!event.target.dataset.calendarDate)return;
  event.preventDefault();let index=days.indexOf(event.target.dataset.calendarDate)+delta;
  while(index>=0&&index<days.length){const next=table.querySelector(`[data-calendar-date="${days[index]}"]`);if(next&&!next.disabled){next.focus();break;}index+=delta;}
 });
 calendar.append(table,element('p',state.loadingSlots?'Select a verified date. More dates are still being checked.':'Select an available date.',{class:'calendar-hint',role:'status'}));
 const times=element('section',null,{class:'calendar-times','aria-label':'Available times'});
 if(state.busy)times.append(element('h3','Checking dates'),element('p','Checking Google Calendar availability…',{role:'status',class:'calendar-status'}));
 else if(state.error)times.append(element('h3','Availability unavailable'),element('p','Refresh the times to try again. Your project answers are saved.',{class:'calendar-status'}));
 else if(!state.slots.length)times.append(element('h3','No available dates'),element('p','No available dates this month. Try another month.',{role:'status',class:'calendar-status'}));
 else if(state.selectedDate)times.append(slotList(state.slots.filter(s=>dateKey(s.start,state.zone)===state.selectedDate),state.zone,start=>controller.choose(start,state.zone)));
 else times.append(element('h3','Choose a date'),element('p','Available times will appear here.',{class:'calendar-status'}));
 layout.append(calendar,times);return layout;
}
export function safeManageUrl(value){try{const u=new URL(value);if(u.origin!=='https://elyshaworks.com'||u.pathname!=='/booking/manage/')return null;return u.href;}catch{return null;}}
export function mountBooking(root){
 const config=runtimeConfig();
 const intent=projectIntent(location.search);
 const localPreview=['127.0.0.1','localhost'].includes(location.hostname)&&!globalThis.__ELY_BOOKING_TEST_CONFIG__;
 try{if(!localPreview)validateConfig(config);}catch{
  root.replaceChildren(element('h2','Online booking is not open yet'),element('p','Please check back soon to book a discovery call. No details have been collected or sent.',{role:'status'}),element('p','For an enquiry while scheduling is closed, email support. An email is not a confirmed appointment.'),supportLink(),element('p','When available, Google Calendar checks Elysha’s availability and creates your Google Meet invitation. You do not need to connect your own calendar.'),element('a','Back to Elysha Works',{href:'/',class:'booking-secondary'}));
  document.querySelectorAll('.booking-progress').forEach(n=>{n.hidden=true;});
  return null;
 }
 let apiPromise;const getApi=()=>localPreview?Promise.reject(new Error('disconnected')):apiPromise??=configuredApi(config).catch(e=>{apiPromise=null;throw e;});
 const api=Object.fromEntries(['submit','availability','confirm','status'].map(name=>[name,async(...args)=>(await getApi())[name](...args)]));
 const submitIntake=api.submit;api.submit=(input,key)=>submitIntake(projectIntake(input,intent),key);
 const intro=root.closest('.booking-shell')?.querySelector('.booking-intro');
 if(intent&&intro){intro.querySelector('h1').textContent='Let’s build something similar.';const reference=element('div',null,{class:'booking-reference','data-project-reference':intent.key});reference.append(element('span','Your reference'),element('strong',intent.title),element('a','Choose a different project',{href:'../#work'}));intro.querySelector('h1').after(reference);}
 const controller=createBookingController({api});let lastStep='',polls=0,timer,focusIntent=null;
 const field=(form,key,label,required,max,help,textarea=false)=>{const wrap=element('div',null,{class:'booking-field'});const input=element(textarea?'textarea':'input',null,{id:`answer-${key}`,name:key,maxlength:max,...(textarea?{rows:4}:{type:key==='email'?'email':'text'})});input.required=required;input.value=controller.snapshot().answers[key]??'';if(['first','last','email','organization'].includes(key))input.autocomplete={first:'given-name',last:'family-name',email:'email',organization:'organization'}[key];wrap.append(element('label',label,{for:input.id}),input);if(help){const hint=element('small',help,{id:`help-${key}`});input.setAttribute('aria-describedby',hint.id);wrap.append(hint);}form.append(wrap);};
 function render(state){
  if(showBookingThankYou(state)){clearTimeout(timer);return;}
  const focused=document.activeElement,focusDate=focused?.dataset.calendarDate,focusAction=focused?.dataset.calendarAction,focusZone=focused?.classList.contains('booking-zone');
  if(root.contains(focused))focusIntent=focusDate?{date:focusDate}:focusAction?{action:focusAction}:focusZone?{zone:true}:null;
  else if(focused&&focused!==document.body)focusIntent=null;
  clearTimeout(timer);root.replaceChildren();root.setAttribute('aria-busy',String(state.busy));
  const shell=root.closest('.booking-shell');if(shell)shell.dataset.bookingStep=state.step;
  if(config.mode==='emulator')root.append(element('p','Local integration test. Synthetic calendar only; no real appointments or emails.',{class:'booking-emulator'}));
  const titles={questions:'About your project',times:'Choose a time',review:'Review your call',pending:'Checking your booking',confirmed:'Your call is confirmed',cancelled:'Your call is cancelled'};
  const heading=element('h2',titles[state.step],{tabindex:'-1'});root.append(heading);
  if(intent)root.append(element('p',`Inspired by ${intent.title}`,{class:'booking-reference-summary'}));
  document.querySelectorAll('[data-progress]').forEach(n=>{n.removeAttribute('aria-current');if(n.dataset.progress===(['pending','confirmed'].includes(state.step)?'review':state.step))n.setAttribute('aria-current','step');});
  if(state.error)root.append(element('p',message(state.error),{class:'booking-error',role:'alert'}));
  if(state.step==='questions'){
   root.append(element('p',localPreview?'Preview the discovery-call form. Scheduling is not connected in this local version; your answers will not be sent.':'Tell Elysha a little about your business. Required fields must be completed before choosing a time.'));
   const form=element('form',null,{class:'booking-form'});const names=element('div',null,{class:'booking-fields'});field(names,'first','First Name',true,80);field(names,'last','Last Name',true,80);form.append(names);field(form,'email','Email',true,254);field(form,'organization','Organization / Business Name',false,160);field(form,'business',intent?'What does your business do?':'Business Field',true,160);field(form,'challenge',intent?intent.question:'Biggest Challenge Right Now',true,intent?intent.answerLimit:2000,intent?intent.help:'Share the bottlenecks, repetitive tasks, or workflow gaps currently costing you time or revenue.',true);field(form,'outcome',intent?intent.outcomeQuestion:'Desired Outcome',false,2000,intent?'Describe the people who would use this and what you want the finished website or system to help them do.':'Tell me what a successful outcome would look like and which goals you want automation to support.',true);
   const trap=element('div',null,{class:'booking-honeypot','aria-hidden':'true'});trap.append(element('label','Website',{for:'booking-website'}),element('input',null,{id:'booking-website',name:'website',tabindex:'-1',autocomplete:'off'}));form.append(trap);
   form.append(element('p',localPreview?'Local preview only. No answers are saved or sent, and no appointment can be reserved here yet.':'Continuing saves your answers in Elysha’s CRM before you choose a time, even if you do not finish booking. Elysha can prepare and follow up about your enquiry. This does not subscribe you to marketing emails. Non-client enquiry records are reviewed for deletion three calendar months after your last interaction.',{class:'booking-notice'}),bookingPolicy());
   const submit=element('button',localPreview?'Scheduling not connected':state.busy?'Saving your answers…':'Continue to available times',{type:'submit',class:'booking-primary'});submit.disabled=state.busy||localPreview;form.append(submit);
   form.addEventListener('submit',event=>{event.preventDefault();if(localPreview||!form.reportValidity())return;const data=new FormData(form),answers={};for(const key of ['first','last','email','organization','business','challenge','outcome'])answers[key]=String(data.get(key)??'').trim();void controller.submit({answers,source:new URLSearchParams(location.search).get('source')==='rhea'?'rhea':'portfolio',noticeVersion:'booking-2026-09-03',website:String(data.get('website')??'')});});root.append(form);
  }else if(state.step==='times'){
   root.append(element('p','Your project answers are saved. Choose a date, then an available 30-minute Google Meet call.'));
   root.append(localTimeZone(state.zone),calendarPicker(state,controller));
   const footer=element('div',null,{class:'calendar-footer'}),refresh=button('Refresh times',()=>void controller.loadSlots(),false,state.busy||state.loadingSlots);refresh.dataset.calendarAction='refresh';
   footer.append(element('p','Times automatically use your device’s time zone and match Elysha’s availability. A slot is reserved only after confirmation.'),refresh);root.append(footer);
  }else if(state.step==='review'){
   root.append(summary({...state.selected,displayTimeZone:state.zone}),element('p','A confirmation will appear here once Google Calendar verifies your appointment. Google handles the invitation email.'),bookingPolicy());
   const actions=element('div',null,{class:'booking-actions'});actions.append(button('Confirm booking',()=>void controller.confirm(),true,state.busy),button('Choose another time',()=>controller.back(),false,state.busy));root.append(actions);
  }else if(state.step==='pending'){
   root.append(element('p','Your booking is still being verified. Please keep this page open and do not submit a second booking.',{role:'status'}),button(state.busy?'Checking…':'Check booking status',()=>void controller.poll(),true,state.busy));
   if(!state.busy&&polls<8){timer=setTimeout(()=>{polls++;void controller.poll();},Math.min(30000,2000*2**polls));}
  }else if(state.result){
   root.append(summary(state.result.booking));const b=state.result.booking;
   if(b.status==='confirmed'){root.append(element('p','Your appointment is confirmed in the calendar. Google handles the invitation; email delivery has not been verified here.'));if(b.meetUrl&&/^https:\/\/meet\.google\.com\/[a-z-]+$/.test(b.meetUrl))root.append(element('a','Open Google Meet',{href:b.meetUrl,target:'_blank',rel:'noreferrer',class:'booking-primary'}));else root.append(element('p','Meeting link is being prepared.'));
    const manage=safeManageUrl(state.result.manageUrl);if(manage)root.append(element('p','Keep the management link in your calendar invitation, or use the link below.'),element('a','Manage this booking',{href:manage,class:'booking-secondary',referrerpolicy:'no-referrer'}));}
  }
  if(lastStep!==state.step){focusIntent=null;heading.focus({preventScroll:true});lastStep=state.step;}
  else if(focusIntent&&!state.busy){
   let target=focusIntent.date?root.querySelector(`[data-calendar-date="${focusIntent.date}"]`):focusIntent.action?root.querySelector(`[data-calendar-action="${focusIntent.action}"]`):root.querySelector('.booking-zone');
   if((!target||target.disabled)&&state.loadingSlots&&focusIntent.action)return;
   if(!target||target.disabled)target=root.querySelector('.calendar-header h3');target?.focus({preventScroll:true});
  }
 }
 controller.subscribe(render);render(controller.snapshot());window.addEventListener('pagehide',()=>clearTimeout(timer),{once:true});return controller;
}
if(typeof document!=='undefined'&&document.getElementById('booking-app'))mountBooking(document.getElementById('booking-app'));
