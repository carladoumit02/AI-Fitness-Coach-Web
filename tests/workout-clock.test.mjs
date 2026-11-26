import test from 'node:test';
import assert from 'node:assert/strict';
import {resumeWorkoutClock,shouldPauseForHiddenTab} from '../src/workout-clock.js';

test('pause excludes stopped time from elapsed session clock',()=>{
 const t=resumeWorkoutClock({pausedAtMs:5000,nowMs:12500,startedAtSec:5,countdownUntilMs:0,phase:'active'});
 assert.equal(t.elapsedMs,7500);
 assert.equal(t.startedAtSec,12.5);
 assert.equal(t.countdownUntilMs,0);
});
test('countdown remains at the same remaining time after pause',()=>{
 const t=resumeWorkoutClock({pausedAtMs:1000,nowMs:4000,startedAtSec:0,countdownUntilMs:4500,phase:'countdown'});
 assert.equal(t.countdownUntilMs,7500);
});
test('hidden tabs pause once, but paused sessions remain paused',()=>{
 assert.equal(shouldPauseForHiddenTab({active:true,paused:false,hidden:true}),true);
 assert.equal(shouldPauseForHiddenTab({active:true,paused:true,hidden:true}),false);
 assert.equal(shouldPauseForHiddenTab({active:false,paused:false,hidden:true}),false);
});
