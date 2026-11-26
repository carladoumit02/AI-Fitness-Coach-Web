// Additional exercise geometry ported from Dimitri V2 features.py/motion.py.
// Browser side/front-view estimates, not validated movement classification.
import { jointAngle, MEDIAPIPE, clamp } from './scoring.js';
const p=(pts,i)=>pts?.[i];
const visibility=(pts,ids)=>ids.every(i=>Number(p(pts,i)?.visibility??0)>=.45);
const d=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export function extraMetrics(pts,exercise){
 if(!pts||pts.length<33)return null;
 if(exercise==='jack'){
   const ids=[11,12,13,14,15,16,23,24,25,26,27,28];
   if(!visibility(pts,ids))return null;
   const sh=d(pts[11],pts[12]);if(sh<.035)return null;
   const spread=Math.abs(pts[27].x-pts[28].x)/sh;
   // Arm elevation: wrist higher (smaller y) than shoulder = raised.
   const a=(pts[15].y<pts[11].y-.08 && pts[16].y<pts[12].y-.08)?1:0;
   const spreadOpen=spread>1.7;
   return {angle:a&&spreadOpen?65:170,confidence:.75,feedback:'Raise both arms and move feet apart',custom:{spread}};
 }
 const isCurl=exercise==='curl';
 let side=[11,13,15,23,25,27];
 if((pts[12]?.visibility??0)>(pts[11]?.visibility??0))side=[12,14,16,24,26,28];
 const ids=isCurl?side.slice(0,3):side.slice(3,6);
 if(!visibility(pts,ids))return null;
 if(isCurl){
   const angle=jointAngle(pts[side[0]],pts[side[1]],pts[side[2]]);
   return {angle,confidence:.75,feedback:'Keep your upper arm steady as you curl'};
 }
 const angle=jointAngle(pts[side[3]],pts[side[4]],pts[side[5]]);
 return {angle,confidence:.75,feedback:'Keep torso upright and use a staggered stance'};
}
export function updateExtraCounter(counter,metrics,time){
 const dt=counter.lastTime==null?0:clamp(time-counter.lastTime,0,.25);
 counter.lastTime=time;
 if(!metrics||!Number.isFinite(metrics.angle)){counter.feedback='Show your full body in frame.';return counter;}
 const cfg=counter.exercise==='lunge'?{top:158,begin:140,depth:105}:counter.exercise==='curl'?{top:155,begin:135,depth:75}:{top:155,begin:135,depth:85};
 const a=metrics.angle;
 if(counter.state==='ready'&&a>=cfg.top)counter.state='top';
 else if(counter.state==='top'&&a<cfg.begin)counter.state='down';
 else if(counter.state==='down'&&a<=cfg.depth)counter.state='bottom';
 else if(counter.state==='bottom'&&a>=cfg.top){counter.reps++;counter.state='top';}
 counter.samples++;counter.qualityTotal+=a>35&&a<=180?85:45;
 counter.feedback=counter.state==='bottom'?'Return to the starting position':(metrics.feedback||'Move with control');
 return counter;
}
export function recognizeExercise(pts){
 // Useful live hint, NOT the desktop LSTM model.
 if(!visibility(pts,[11,12,23,24,25,26,27,28]))return {exercise:'idle',confidence:0};
 const shoulder=pts[11],hip=pts[23],ankle=pts[27];
 const horizontal=Math.abs(shoulder.y-ankle.y)<.3;
 const squatting=(jointAngle(pts[23],pts[25],pts[27])<145);
 if(horizontal)return {exercise:'plank',confidence:.52};
 if(squatting)return {exercise:'squat',confidence:.55};
 return {exercise:'idle',confidence:.35};
}
