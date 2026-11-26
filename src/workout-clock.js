// Shared pause and resume timing utilities.
export function resumeWorkoutClock({pausedAtMs,nowMs,startedAtSec,countdownUntilMs,phase}){
  const elapsedMs=Math.max(0,Number(nowMs)-Number(pausedAtMs));
  return {
    elapsedMs,
    startedAtSec:Number(startedAtSec)+elapsedMs/1000,
    countdownUntilMs:phase==='countdown'?Number(countdownUntilMs)+elapsedMs:Number(countdownUntilMs)
  };
}
export function shouldPauseForHiddenTab({active,paused,hidden}){
  return Boolean(active&&hidden&&!paused);
}
