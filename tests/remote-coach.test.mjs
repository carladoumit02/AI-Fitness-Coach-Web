import test from 'node:test';
import assert from 'node:assert/strict';
import {assessFrame,activityCue,cueForVoice} from '../src/remote-coach.js';

function pose(){
  const p=Array.from({length:33},()=>({x:.5,y:.5,visibility:.15}));
  for(const [id,x,y] of [[11,.45,.23],[13,.45,.4],[15,.45,.52],[23,.48,.53],[25,.49,.70],[27,.49,.89]]){
    p[id]={x,y,visibility:.95};
  }
  return p;
}
test('A side view with visible major joints is acceptable',()=>{
 const s=assessFrame(pose(),'squat');
 assert.equal(s.kind,'ready');
});
test('No visible person provides a simple distance-readable direction',()=>{
 const c=assessFrame([], 'squat');
 assert.equal(c.kind,'missing'); assert.ok(c.title.length<35);
});
test('Partial, clipped body has an actionable positioning cue',()=>{
 const p=pose();p[27]={x:.98,y:.99,visibility:.95};
 const s=assessFrame(p,'squat');
 assert.equal(s.kind,'far');
});
test('Countdown and spoken direction are clear',()=>{
 const cue=activityCue({exercise:'squat',phase:'countdown',frame:assessFrame(pose(),'squat'),ready:true,seconds:2.1});
 assert.equal(cue.title,'3');assert.ok(cueForVoice(cue));
});

test('small full-body pose asks user to move closer',()=>{const p=pose();for(const v of p){v.x=.5+(v.x-.5)*.25;v.y=.5+(v.y-.5)*.25;}assert.equal(assessFrame(p,'squat').title,'MOVE CLOSER');});
