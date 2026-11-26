// Three-exercise workout programs and adaptive session helpers.
// Explicitly experimental form and movement proxies; not clinical advice.
export const EXERCISES = Object.freeze({
  squat: {label:'Squats', unit:'reps', target:10, view:'Side or front'},
  pushup: {label:'Push-ups', unit:'reps', target:5, view:'Side'},
  plank: {label:'Forearm plank', unit:'seconds', target:20, view:'Side'}
});
export const PRESETS = Object.freeze([
  {name:'Beginner',description:'Build a strong foundation',rest:30,exercises:[{name:'squat',target:10},{name:'pushup',target:5},{name:'plank',target:20}]},
  {name:'Intermediate',description:'Increase endurance and control',rest:25,exercises:[{name:'squat',target:15},{name:'pushup',target:10},{name:'plank',target:40}]},
  {name:'Advanced',description:'Challenge strength and consistency',rest:20,exercises:[{name:'squat',target:25},{name:'pushup',target:20},{name:'plank',target:60}]}
]);
export function clonePlan(p){return JSON.parse(JSON.stringify(p));}
export function validatePlan(input){
  const name=String(input?.name??'').trim().slice(0,70);
  const rest=Number(input?.rest);
  const ex=input?.exercises;
  if(!name)throw new Error('Enter a program name.');
  if(!Number.isInteger(rest)||rest<0||rest>300)throw new Error('Rest must be 0–300 seconds.');
  if(!Array.isArray(ex)||ex.length<1||ex.length>12)throw new Error('Choose 1–12 sets.');
  const exercises=ex.map((e,i)=>{
    const n=e?.name, t=Number(e?.target);
    if(!Object.hasOwn(EXERCISES,n))throw new Error('Unknown exercise in set '+(i+1));
    if(!Number.isInteger(t)||t<1||t>300)throw new Error('Set '+(i+1)+': choose a target from 1–300.');
    return {name:n,target:t};
  });
  return {name,rest,exercises};
}
export const clamp=(v,a,b)=>Math.min(b,Math.max(a,Number(v)||0));
export const score=(quality,completion)=>Math.round(clamp(quality,0,100)*clamp(completion,0,100)/100);
export function grade(s){return s>=90?'A':s>=80?'B':s>=70?'C':s>=60?'D':'F';}
export function adaptPlan(input,rows=[]){
  const plan=clonePlan(validatePlan(input));
  plan.adaptive=true;
  const prior=rows.filter(r=>String(r.program||'').replace(' / Adaptive','')===plan.name && Number(r.completion)>=90).slice(-2);
  plan.name+=' / Adaptive';
  if(!prior.length)return {plan,note:'First session: original targets, with smart rest enabled.'};
  const last=Number(prior.at(-1).quality);
  if(last<75){for(const e of plan.exercises)e.target=Math.max(1,Math.round(e.target*.85));plan.rest+=10;return {plan,note:'Previous form quality was lower: targets reduced and rest increased.'};}
  if(last>=90&&prior.length>=2&&Number(prior[0].quality)>=90){
    for(const e of plan.exercises)e.target=Math.max(1,Math.round(e.target*1.10));
    return {plan,note:'Two high-quality sessions: modest target increase.'};
  }
  return {plan,note:'Targets unchanged; smart rest enabled.'};
}
export function summarizePlan(plan,exercises,duration){
  const n=plan.exercises.length;
  const observed=exercises.reduce((s,e)=>s+(Number(e.observed)||0),0);
  const good=exercises.reduce((s,e)=>s+(Number(e.goodSeconds)||0),0);
  const quality=observed?Math.round(good/observed*100):0;
  const completion=Math.round(exercises.reduce((s,e)=>s+clamp(e.completion,0,100),0)/Math.max(1,n));
  return {program:plan.name,duration:Math.round(duration),quality,completion,score:score(quality,completion),
    reps:exercises.reduce((s,e)=>s+(Number(e.reps)||0),0),exercises};
}
export function motionSummary(attempts){
  const rows=attempts.filter(x=>x.complete);
  const avg=(key)=>rows.length?Math.round((rows.reduce((s,x)=>s+(Number(x[key])||0),0)/rows.length+1e-9)*10)/10:null;
  const result={avg_tempo:avg('seconds'),avg_range:avg('range'),performance_change:null};
  if(rows.length>=6){
    const first=rows.slice(0,3),last=rows.slice(-3);
    const mean=(a,k)=>a.reduce((s,x)=>s+Number(x[k]||0),0)/a.length;
    const slowdown=Math.round((mean(last,'seconds')/Math.max(.1,mean(first,'seconds'))-1)*100);
    const change=Math.round((mean(last,'range')/Math.max(1,mean(first,'range'))-1)*100);
    const drop=Math.round(mean(first,'quality')-mean(last,'quality'));
    result.performance_change={slowdown,range_change:change,quality_drop:drop,decline:(slowdown>25&&change< -10)||drop>20};
  }
  return result;
}
export function referencePose(ex,progress=.5){
  const p=clamp(progress,0,1);let s,e,w,h,k,a;
  if(ex==='squat'||ex==='lunge'){
    h=[.45-.09*p,.49+.17*p];k=[.49+.12*p,.72];a=[.5,.89];s=[h[0]+.10*p,h[1]-.24];e=[s[0]+.12,s[1]+.10];w=[e[0]+.10,e[1]-.02];
    if(ex==='lunge'){a=[.66,.89];k=[.65,.73];h=[.47,.49+.17*p];s=[.47,h[1]-.24];}
  }else if(ex==='curl'){
    s=[.45,.25];h=[.45,.5];k=[.45,.7];a=[.45,.9];e=[.46,.44];w=[.46+.14*Math.sin(Math.PI*p),.44+.17*Math.cos(Math.PI*p)];
  }else if(ex==='jack'){
    s=[.42,.26];h=[.45,.5];k=[.45-.13*p,.7];a=[.45-.24*p,.9];e=[.41-.19*p,.43-.30*p];w=[.40-.27*p,.59-.58*p];
  }else{
    const t=ex==='pushup'?p:.8;s=[.25,.49+.18*t];a=[.82,.86];h=[.52,s[1]+(.86-s[1])*.47];k=[.67,s[1]+(.86-s[1])*.74];e=ex==='pushup'?[.25-.12*t,.70+.16*t]:[.25,.86];w=ex==='pushup'?[.25,.89]:[.10,.86];
  }
  const out={11:s,13:e,15:w,23:h,25:k,27:a};
  if(ex==='jack'||ex==='lunge'){
    for(const [left,right] of [[11,12],[13,14],[15,16],[23,24],[25,26],[27,28]]){
      const [x,y]=out[left];out[right]=ex==='jack'?[1-x,y]:[x+(left===25||left===27?-.15:.04),y];
    }
  }
  return out;
}
