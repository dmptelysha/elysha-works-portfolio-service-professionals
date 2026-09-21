const DAY=86400000;
export function dateKey(instant,zone){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(instant).map(p=>[p.type,p.value]));
 return `${parts.year}-${parts.month}-${parts.day}`;
}
export function monthDate(month){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Error('invalid');
 return new Date(`${month}-01T12:00:00Z`);
}
export function shiftMonth(month,delta){const d=monthDate(month);d.setUTCMonth(d.getUTCMonth()+delta);return d.toISOString().slice(0,7);}
export function monthDays(month){
 const d=monthDate(month),first=d.getUTCDay();d.setUTCMonth(d.getUTCMonth()+1,0);
 return {offset:first,days:Array.from({length:d.getUTCDate()},(_,i)=>`${month}-${String(i+1).padStart(2,'0')}`)};
}
export function monthBounds(now,zone){return {first:dateKey(now,zone).slice(0,7),last:dateKey(now+60*DAY,zone).slice(0,7)};}
export function monthRanges(month,now){
 // Query a UTC envelope around the displayed month. The extra day at each end
 // covers every visitor offset and DST boundary; display grouping stays zoned.
 const from=Math.max(now,monthDate(month).setUTCHours(0,0,0,0)-DAY);
 const to=Math.min(now+60*DAY+1,monthDate(shiftMonth(month,1)).setUTCHours(0,0,0,0)+DAY);
 const ranges=[];for(let cursor=from;cursor<to;cursor+=14*DAY)ranges.push({from:cursor,to:Math.min(cursor+14*DAY,to)});
 return ranges;
}
