import test from 'node:test';
import assert from 'node:assert/strict';
import {rating, grade, completionPercent,jointAngle,makeCounter,updateCounter,observedCount,formQuality} from '../src/scoring.js';
test('V3 score and grade',()=>{assert.equal(rating(90,80),72);assert.equal(grade(72),'C');assert.equal(grade(90),'A');assert.equal(rating(200,200),100);assert.equal(completionPercent(15,10),100);});
test('joint angles',()=>{assert.equal(Math.round(jointAngle({x:0,y:0},{x:0,y:1},{x:1,y:1})),90);});
test('squat down/up one complete rep',()=>{const c=makeCounter('squat');let t=0;for (const a of [170,160,100,95,90,135,165,175]){updateCounter(c,{knee:a,elbow:180,confidence:.99},t+=.1);} assert.equal(observedCount(c),1);assert.ok(formQuality(c)>0);});
test('plank only counts aligned time',()=>{const c=makeCounter('plank');updateCounter(c,{confidence:1,alignment:175,plankKnee:170},0);updateCounter(c,{confidence:1,alignment:175,plankKnee:170},.2);updateCounter(c,{confidence:1,alignment:140,plankKnee:170},.4);assert.equal(observedCount(c),.2);});

test('squat quality distinguishes depth and extension',()=>{
 const run=angles=>{const c=makeCounter('squat');let time=0;for(const knee of angles)updateCounter(c,{knee,confidence:1},time+=.1);return c;};
 const deep=run([175,175,90,90,90,175,175]);
 const shallow=run([158,158,114,114,114,158,158]);
 assert.equal(deep.reps,1);assert.equal(shallow.reps,1);
 assert.ok(formQuality(deep)>formQuality(shallow)+20);
 assert.equal(formQuality(run([175,175,175])),0);
});
test('push-up body alignment affects quality',()=>{
 const run=alignment=>{const c=makeCounter('pushup');let time=0;for(const elbow of [175,175,85,85,85,175,175])updateCounter(c,{elbow,alignment,confidence:1},time+=.1);return formQuality(c);};
 assert.ok(run(175)>run(135)+20);
});
test('plank quality varies continuously with alignment',()=>{
 const run=alignment=>{const c=makeCounter('plank');updateCounter(c,{alignment,plankKnee:170,confidence:1},0);return formQuality(c);};
 assert.ok(run(175)>run(160));assert.ok(run(160)>run(140));
});
