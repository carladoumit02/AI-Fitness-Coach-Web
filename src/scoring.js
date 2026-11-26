// V3 desktop scoring: exercise rating = observed form quality × target completion / 100.
export const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));
export function rating(formQuality, completion) {
  return Math.round(clamp(formQuality, 0, 100) * clamp(completion, 0, 100) / 100);
}
export function grade(score) {
  const s = clamp(score, 0, 100);
  return s >= 90 ? 'A' : s >= 80 ? 'B' : s >= 70 ? 'C' : s >= 60 ? 'D' : 'F';
}
export function completionPercent(achieved, target) {
  return target > 0 ? Math.round(clamp((achieved / target) * 100, 0, 100)) : 0;
}
export function jointAngle(a, b, c) {
  if (!a || !b || !c) return NaN;
  const ux = a.x - b.x, uy = a.y - b.y, vx = c.x - b.x, vy = c.y - b.y;
  const den = Math.hypot(ux, uy) * Math.hypot(vx, vy);
  if (!den) return NaN;
  return Math.acos(clamp((ux * vx + uy * vy) / den, -1, 1)) * 180 / Math.PI;
}
export const MEDIAPIPE = {
  shoulderL:11, shoulderR:12, elbowL:13, elbowR:14, wristL:15, wristR:16,
  hipL:23, hipR:24, kneeL:25, kneeR:26, ankleL:27, ankleR:28,
};
export function bestSide(points, names) {
  const left = names.map(n => points[MEDIAPIPE[n+'L']]);
  const right = names.map(n => points[MEDIAPIPE[n+'R']]);
  const score = side => side.reduce((total,p)=>total+(p?.visibility ?? 0),0);
  return score(right) > score(left) ? right : left;
}
export function getMotionAngles(points) {
  if (!points || points.length < 29) return null;
  const [hip, knee, ankle] = bestSide(points, ['hip','knee','ankle']);
  const [shoulder, elbow, wrist] = bestSide(points, ['shoulder','elbow','wrist']);
  const [plankShoulder, plankHip, plankAnkle] = bestSide(points, ['shoulder','hip','ankle']);
  const [plankHip2, plankKnee, plankAnkle2] = bestSide(points, ['hip','knee','ankle']);
  return {
    knee: jointAngle(hip, knee, ankle),
    elbow: jointAngle(shoulder, elbow, wrist),
    alignment: jointAngle(plankShoulder, plankHip, plankAnkle),
    plankKnee: jointAngle(plankHip2,plankKnee,plankAnkle2),
    confidence: Math.min(...[shoulder,elbow,wrist,hip,knee,ankle].map(p=>p?.visibility??0)),
    squatConfidence: Math.min(...[hip,knee,ankle].map(p=>p?.visibility??0)),
    pushupConfidence: Math.min(...[shoulder,elbow,wrist].map(p=>p?.visibility??0)),
    plankConfidence: Math.min(...[plankShoulder,plankHip,plankAnkle,plankKnee].map(p=>p?.visibility??0)),
  };
}
export function makeCounter(exercise) {
  return { exercise, state:'ready', reps:0, validSeconds:0, lastTime:null, angles:[], samples:0, qualityTotal:0, feedback:'Stand in frame to begin.' };
}
function median(values) {
  const a = [...values].sort((x,y)=>x-y);
  return a[Math.floor(a.length / 2)];
}
export function updateCounter(counter, metrics, nowSeconds) {
  const elapsed = counter.lastTime == null ? 0 : clamp(nowSeconds - counter.lastTime, 0, 0.25);
  counter.lastTime = nowSeconds;
  const confidence = metrics?.[counter.exercise === 'plank' ? 'plankConfidence' : counter.exercise === 'squat' ? 'squatConfidence' : 'pushupConfidence'] ?? metrics?.confidence;
  if (!metrics || confidence < 0.45) {
    counter.feedback = 'Keep your full body visible.';
    return counter;
  }
  const isPlank = counter.exercise === 'plank';
  const raw = counter.exercise === 'squat' ? metrics.knee : metrics.elbow;
  if (!isPlank && !Number.isFinite(raw)) return counter;
  let quality = 0;
  if (isPlank) {
    const aligned = Number.isFinite(metrics.alignment) && Number.isFinite(metrics.plankKnee) && metrics.alignment >= 160 && metrics.plankKnee >= 150;
    if (aligned) counter.validSeconds += elapsed;
    quality = aligned ? 92 : 48;
    counter.feedback = aligned ? 'Good alignment — keep holding.' : 'Adjust hips and straighten your legs.';
  } else {
    counter.angles.push(raw);
    if (counter.angles.length > 3) counter.angles.shift();
    const angle = median(counter.angles);
    const down = counter.exercise === 'squat' ? 115 : 100;
    const up = counter.exercise === 'squat' ? 155 : 155;
    if (counter.state === 'ready' && angle <= down) counter.state = 'down';
    else if (counter.state === 'down' && angle >= up) { counter.state = 'ready'; counter.reps++; }
    counter.feedback = counter.state === 'down' ? 'Push back up to complete the rep.' : 'Lower with control.';
    quality = (angle >= 60 && angle <= 180) ? (counter.state === 'down' ? 90 : 82) : 55;
  }
  counter.samples++;
  counter.qualityTotal += quality;
  return counter;
}
export function formQuality(counter) { return counter.samples ? Math.round(counter.qualityTotal / counter.samples) : 0; }
export function observedCount(counter) {return counter.exercise==='plank' ? Math.round(counter.validSeconds * 10)/10 : counter.reps;}
