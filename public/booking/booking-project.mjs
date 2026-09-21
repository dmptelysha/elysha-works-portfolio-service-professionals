// Only known portfolio projects may set booking context. User text stays in existing answer fields.
const projects=Object.freeze({
 'esl-tutor':Object.freeze({title:'Teacher Elysha',question:'What lessons or services would your website offer?',help:'Tell me what you teach or offer and which parts of this website you would like for your own business.'}),
 'la-jaysiedel-cakes':Object.freeze({title:'La Jaysiedel Cakes',question:'What products would you sell, and how should customers order?',help:'Describe your products, how you handle orders today, and what you would like from a similar online shop.'}),
 'client-portal':Object.freeze({title:'Elysha Works Client Portal',question:'What should clients be able to see or do in your portal?',help:'For example, follow project progress, find files, or complete their next steps. Tell me what matters for your clients.'}),
 'growth-crm':Object.freeze({title:'Elysha Works Growth CRM',question:'Which leads, follow-ups, or daily tasks should your CRM help manage?',help:'Describe how you manage enquiries today and which parts of this workspace you would want for your business.'})
});
export function projectIntent(search=''){
 const key=new URLSearchParams(search).get('project');
 if(!Object.hasOwn(projects,key))return null;
 const project=projects[key],prefix=`Reference project: ${project.title}\nRequested build: `;
 return Object.freeze({key,...project,prefix,answerLimit:2000-prefix.length,outcomeQuestion:'Who will use it, and what would a successful result look like?'});
}
export function projectIntake(input,intent){
 if(!intent)return input;
 const challenge=String(input.answers?.challenge??'');
 if(!challenge.trim()||challenge.length>intent.answerLimit)throw Error('invalid');
 return {...input,answers:{...input.answers,challenge:intent.prefix+challenge}};
}
