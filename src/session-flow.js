// Target-based completion: shared by standalone sessions and guided programs.
// Only count complete repetitions or valid plank hold time during active tracking.
export function shouldAutoFinish(counter, target, phase='active', finishing=false) {
  if (finishing || phase !== 'active' || !counter || !Number.isFinite(Number(target)) || target <= 0) return false;
  if ((counter.samples ?? 0) < 4) return false; // Reject immediate / stale detections.
  const achieved = counter.exercise === 'plank' ? Number(counter.validSeconds) : Number(counter.reps);
  return Number.isFinite(achieved) && achieved >= Number(target);
}
export function workoutCompletionLabel({program=false,endedEarly=false}={}) {
  if (endedEarly) return 'Workout ended early';
  return program ? 'PROGRAM COMPLETE!' : 'WORKOUT COMPLETE!';
}
export function setCompletionLabel({completed=false,program=false}={}) {
  return completed ? (program ? 'Exercise complete! Time to rest.' : 'Target reached!') : 'Workout ended early';
}
