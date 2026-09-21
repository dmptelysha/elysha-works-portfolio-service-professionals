import {thankYouVideo} from './thank-you-config.mjs';

// This receipt is display-only. It is never persisted or reconstructed from a URL.
// Only the booking controller's confirmed backend response may supply it.
export function confirmedReceipt(state){
 const b=state?.result?.booking;
 if(state?.step!=='confirmed'||b?.status!=='confirmed'||typeof b.id!=='string'||!b.id||!Number.isFinite(b.start)||b.start<=0)return null;
 try{new Intl.DateTimeFormat('en',{timeZone:b.displayTimeZone}).format(b.start);if(!b.displayTimeZone)return null;}catch{return null;}
 let manageUrl=null;
 try{const u=new URL(state.result.manageUrl);if(u.origin==='https://elyshaworks.com'&&u.pathname==='/booking/manage/'&&!u.search&&!u.username&&!u.password)manageUrl=u.href;}catch{}
 const meetUrl=typeof b.meetUrl==='string'&&/^https:\/\/meet\.google\.com\/[a-z-]+$/.test(b.meetUrl)?b.meetUrl:null;
 return {start:b.start,zone:b.displayTimeZone,meetUrl,manageUrl};
}
function asset(value,extensions){
 if(typeof value!=='string'||!/^\/assets\/[a-zA-Z0-9_/-]+\.[a-zA-Z0-9]+$/.test(value)||value.includes('..'))return '';
 return extensions.some(ext=>value.toLowerCase().endsWith(ext))?value:'';
}
export function videoSettings(config={}){
 const videoSrc=asset(config.videoSrc,['.mp4','.webm']);if(!videoSrc)return null;
 return {videoSrc,posterSrc:asset(config.posterSrc,['.png','.jpg','.jpeg','.webp']),captionsSrc:asset(config.captionsSrc,['.vtt']),captionsLanguage:/^[a-z]{2,3}(-[A-Za-z0-9]+)*$/.test(config.captionsLanguage??'')?config.captionsLanguage:'en',captionsLabel:typeof config.captionsLabel==='string'&&config.captionsLabel.trim()?config.captionsLabel:'English',transcript:typeof config.transcript==='string'?config.transcript:''};
}
function el(tag,text,attributes={}){
 const n=document.createElement(tag);if(text)n.textContent=text;
 for(const [key,value]of Object.entries(attributes))n.setAttribute(key,String(value));return n;
}
function link(text,href,primary=false){return el('a',text,{href,class:primary?'ty-button ty-primary':'ty-button',referrerpolicy:'no-referrer'});}
export function renderThankYou(root,receipt,config=thankYouVideo){
 root.replaceChildren();
 const header=el('header',null,{class:'ty-top'});const home=el('a',null,{href:'/',class:'v3-page-brand'});home.innerHTML="<svg aria-hidden=\"true\" focusable=\"false\" width=\"0\" height=\"0\" style=\"position:absolute\"><defs><filter id=\"logo-lime\" color-interpolation-filters=\"sRGB\"><feColorMatrix type=\"matrix\" values=\"0.94 0 0.06 0 0  1.21 0 -0.21 0 0  0.35 0 0.65 0 0  0 0 0 1 0\"/></filter></defs></svg><img src=\"/assets/insight-system/elysha-works-logo.png\" alt=\"Elysha Works\" width=\"208\"/><span>Back to Elysha Works</span>";header.append(home);root.append(header);
 const main=el('main',null,{class:'ty-main'});
 const intro=el('section',null,{class:'ty-intro'});
 intro.append(el('h1',receipt?'Thank you.\nSee you on the call.':'Looking for your booking?',{tabindex:'-1'}));
 intro.append(el('p',receipt?'Your discovery call is confirmed. Please check your email for the Google Meet link and booking details.':'This page does not have a verified booking confirmation. If you already booked, check your email for the Google Meet invitation and management link.',{class:'ty-lead',role:'status'}));
 main.append(intro);
 if(receipt){
  const layout=el('div',null,{class:'ty-layout'}),message=el('section',null,{class:'ty-message','aria-labelledby':'ty-message-title'});
  const settings=videoSettings(config);
  message.append(el('h2',settings?'A note from Elysha':'Before we meet',{id:'ty-message-title'}));
  if(settings){
   const video=el('video',null,{controls:'',playsinline:'',preload:'none','aria-label':'A thank-you message from Elysha',src:settings.videoSrc});
   if(settings.posterSrc)video.setAttribute('poster',settings.posterSrc);
   if(settings.captionsSrc)video.append(el('track',null,{kind:'captions',src:settings.captionsSrc,srclang:settings.captionsLanguage,label:settings.captionsLabel,default:''}));
   video.append('Your browser does not support this video.');
   const fallback=el('p','The video is unavailable right now. Your call is still confirmed; check your email for the meeting details.',{hidden:'',role:'status',class:'ty-video-error'});
   video.addEventListener('error',()=>{video.hidden=true;fallback.hidden=false;},{once:true});
   message.append(video,fallback);
   if(settings.transcript){const transcript=el('details',null,{class:'ty-transcript'});transcript.append(el('summary','Read the video transcript'),el('p',settings.transcript));message.append(transcript);}
  }
  message.append(el('p','Thank you for sharing what you’re building. Your answers will help guide our conversation.'),el('p','Keep your Google Meet invitation handy. Bring any questions you’d like to explore during our 30-minute call.'));
  const details=el('section',null,{class:'ty-details','aria-labelledby':'ty-details-title'});details.append(el('h2','Your discovery call',{id:'ty-details-title'}));
  const dl=el('dl');
  for(const [label,value]of [['Date & time',new Intl.DateTimeFormat('en',{timeZone:receipt.zone,dateStyle:'full',timeStyle:'short'}).format(receipt.start)],['Time zone',receipt.zone],['Duration','30 minutes'],['Location','Google Meet']]){
   const row=el('div');row.append(el('dt',label),el('dd',value));dl.append(row);
  }
  details.append(dl);
  const actions=el('div',null,{class:'ty-actions'});
  if(receipt.meetUrl){const meet=link('Open Google Meet',receipt.meetUrl,true);meet.target='_blank';meet.rel='noopener noreferrer';actions.append(meet);}
  if(receipt.manageUrl)actions.append(link('Manage this booking',receipt.manageUrl));
  details.append(actions,el('p','Need a different time? Use your booking management link. One reschedule per enquiry is available with at least two hours’ notice, subject to availability.',{class:'ty-fine'}));
  layout.append(message,details);main.append(layout);
 }else{
  const actions=el('div',null,{class:'ty-recovery'});
  actions.append(link('Open booking','/booking/',true),link('Contact support','mailto:support@elyshaworks.com'));main.append(actions);
 }
 const footer=el('footer',null,{class:'ty-footer'});
 footer.append(el('a','Contact support',{href:'mailto:support@elyshaworks.com'}),el('a','Privacy Policy',{href:'/elysha-works-privacy-policy.html'}),el('a','Terms of Service',{href:'/elysha-works-terms-of-service.html'}));
 root.append(main,footer);
}
let shown=false;
export function showBookingThankYou(state){
 const receipt=confirmedReceipt(state);if(!receipt)return false;if(shown)return true;shown=true;
 // Same-document transition keeps private details only in memory. Reload/direct
 // entry intentionally uses the neutral page rather than a stored success flag.
 history.replaceState(null,'','/thank-you/');
 document.title='Thank you for booking | Elysha Works';
 document.querySelectorAll('style,link[rel="stylesheet"]').forEach(n=>n.remove());
 document.head.append(el('link',null,{rel:'stylesheet',href:'/thank-you/thank-you.css'}));
 document.body.className='booking-thank-you-page';document.body.removeAttribute('style');
 document.documentElement.removeAttribute('style');
 renderThankYou(document.body,receipt);
 window.scrollTo(0,0);document.querySelector('.ty-intro h1')?.focus({preventScroll:true});
 return true;
}
if(typeof document!=='undefined'&&document.getElementById('thank-you-entry')){
 // Legacy query/hash values are never interpreted as booking evidence.
 history.replaceState(null,'','/thank-you/');
 renderThankYou(document.body,null);
}
