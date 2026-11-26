import test from 'node:test';
import assert from 'node:assert/strict';
import {PRESETS,EXERCISES,validatePlan,adaptPlan,summarizePlan,motionSummary,referencePose,score} from '../src/programs.js';

test('workout preset sequence and rests are preserved exactly',()=>{
 assert.deepEqual(PRESETS.map(p=>p.name),['Beginner','Intermediate','Advanced']);
 assert.deepEqual(PRESETS.map(p=>p.exercises.map(x=>x.target)),[[10,5,20],[15,10,40],[25,20,60]]);
 assert.deepEqual(PRESETS.map(p=>p.rest),[30,25,20]);
 assert.deepEqual(PRESETS.map(p=>p.exercises.map(x=>x.name)),
  Array.from({length:3},()=>['squat','pushup','plank']));
});
test('only the three agreed exercises are selectable',()=>{
 assert.deepEqual(Object.keys(EXERCISES),['squat','pushup','plank']);
});
test('builder validates 1..12 sets and target values',()=>{
 assert.equal(validatePlan({name:'Demo',rest:20,exercises:[{name:'pushup',target:12}]}).exercises[0].target,12);
 assert.throws(()=>validatePlan({name:'',rest:20,exercises:[{name:'squat',target:1}]}));
 assert.throws(()=>validatePlan({name:'X',rest:1,exercises:[]}));
 assert.throws(()=>validatePlan({name:'X',rest:1,exercises:Array.from({length:13},()=>({name:'squat',target:5}))}));
 assert.throws(()=>validatePlan({name:'X',rest:1,exercises:[{name:'plank',target:0}]}));
});
test('adaptive follows workout quality and target logic',()=>{
 const p=PRESETS[0];const a=adaptPlan(p,[{program:'Beginner',quality:65,completion:100}]);
 assert.deepEqual(a.plan.exercises.map(x=>x.target),[9,4,17]);
 assert.equal(a.plan.rest,40);
 const b=adaptPlan(p,[{program:'Beginner',quality:95,completion:100},{program:'Beginner',quality:95,completion:100}]);
 assert.deepEqual(b.plan.exercises.map(x=>x.target),[11,6,22]);
 assert.equal(p.exercises[0].target,10);
});
test('program grade and summary use  scoring formula',()=>{
 const out=summarizePlan(PRESETS[0],[
 {reps:10,observed:10,goodSeconds:9,completion:100,score:90},
 {reps:5,observed:10,goodSeconds:8,completion:100,score:80},
 {reps:0,observed:10,goodSeconds:7,completion:100,score:70}
 ],60);
 assert.equal(out.quality,80);assert.equal(out.completion,100);assert.equal(out.score,80);
 assert.equal(score(90,80),72);
});
test('motion analytics only label decline as a heuristic',()=>{
 const rows=Array.from({length:6},(_,i)=>({complete:true,seconds:i<3?1:1.7,range:i<3?110:90,quality:i<3?91:62}));
 assert.equal(motionSummary(rows).performance_change.decline,true);
 assert.equal(motionSummary(rows).avg_tempo,1.4);
});
test('reference skeleton coordinates can be drawn for three exercises',()=>{
 for(const code of Object.keys(EXERCISES)){
   const obj=referencePose(code,.5);
   assert.ok(Object.keys(obj).length>=6);
   for(const point of Object.values(obj))assert.ok(point.every(Number.isFinite));
 }
});
