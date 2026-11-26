import test from 'node:test';
import assert from 'node:assert/strict';
import {shouldAutoFinish, workoutCompletionLabel, setCompletionLabel} from '../src/session-flow.js';
test('individual squats stop when target is reached',()=>{
 const c={exercise:'squat',reps:10,samples:40};
 assert.equal(shouldAutoFinish(c,10,'active'),true);
 assert.equal(shouldAutoFinish({...c,reps:9},10,'active'),false);
 assert.equal(shouldAutoFinish(c,10,'countdown'),false);
 assert.equal(shouldAutoFinish(c,10,'active',true),false);
});
test('plank completion requires valid aligned time, not elapsed clock',()=>{
 const c={exercise:'plank',reps:0,validSeconds:19.9,samples:220};
 assert.equal(shouldAutoFinish(c,20,'active'),false);
 c.validSeconds=20;
 assert.equal(shouldAutoFinish(c,20,'active'),true);
});
test('startup glitches do not auto-complete a workout',()=>{
 assert.equal(shouldAutoFinish({exercise:'squat',reps:12,samples:1},10,'active'),false);
 assert.equal(shouldAutoFinish(null,10,'active'),false);
});
test('automatic vs manual early end show different messages',()=>{
 assert.equal(workoutCompletionLabel({program:true}),'PROGRAM COMPLETE!');
 assert.equal(workoutCompletionLabel({program:false}),'WORKOUT COMPLETE!');
 assert.equal(workoutCompletionLabel({program:true,endedEarly:true}),'Workout ended early');
 assert.equal(setCompletionLabel({completed:true,program:true}),'Exercise complete! Time to rest.');
});
