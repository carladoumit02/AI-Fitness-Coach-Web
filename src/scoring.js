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
export function getMotionAngles(points, aspectRatio=1) {
  if (!points || points.length < 29) return null;
  // MediaPipe x/y are normalized by different image dimensions.
  const ratio=Number.isFinite(aspectRatio)&&aspectRatio>0?aspectRatio:1;
  points=points.map(p=>p?{...p,x:p.x*ratio}:p);
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
  const gap = counter.lastTime == null ? 0 : nowSeconds-counter.lastTime;
  const elapsed = gap>0 && gap<=0.5 ? Math.min(gap,0.25) : 0;
  counter.lastTime = nowSeconds;
  const confidence = metrics?.[counter.exercise === 'plank' ? 'plankConfidence' : counter.exercise === 'squat' ? 'squatConfidence' : 'pushupConfidence'] ?? metrics?.confidence;
  const loseTracking = () => {
    counter.feedback = 'Keep your full body visible.';
    counter.lastTime=null;
    counter.previousAligned=false;
    counter.angles=[];
    counter.attempt=null;
    counter.state='ready';
    counter.needsTop=true;
    return counter;
  };
  if (!metrics || !Number.isFinite(confidence) || confidence < 0.45) return loseTracking();
  if(gap>0.5){loseTracking();counter.lastTime=nowSeconds;}
  const isPlank = counter.exercise === 'plank';
  const raw = counter.exercise === 'squat' ? metrics.knee : metrics.elbow;
  if (!isPlank && !Number.isFinite(raw)) return loseTracking();
  let quality = 0;
  const ramp = (value, low, high) => clamp((value-low)/(high-low),0,1);
  if (isPlank) {
    const aligned = Number.isFinite(metrics.alignment) && Number.isFinite(metrics.plankKnee) && metrics.alignment >= 160 && metrics.plankKnee >= 150;
    if (!Number.isFinite(metrics.alignment) || !Number.isFinite(metrics.plankKnee)) return loseTracking();
    if (aligned && counter.previousAligned) counter.validSeconds += elapsed;
    counter.previousAligned=aligned;
    quality = 100 * (0.7*ramp(metrics.alignment,120,175) + 0.3*ramp(metrics.plankKnee,110,170));
    counter.feedback = aligned ? 'Good alignment — keep holding.' : metrics.plankKnee<150 ? 'Straighten your legs.' : 'Align your shoulders, hips and ankles.';
  } else {
    counter.angles.push(raw);
    if (counter.angles.length > 3) counter.angles.shift();
    const angle = median(counter.angles);
    const down = counter.calibration?.down ?? (counter.exercise === 'squat' ? 115 : 100);
    const up = counter.calibration?.up ?? 155;
    if(counter.needsTop){
      if(angle<up){counter.feedback='Return to the starting position.';return counter;}
      counter.needsTop=false;counter.attempt=null;
    }
    // Evaluate movement excursion per repetition, not time spent in each phase.
    const attempt = counter.attempt ??= {top:angle,bottom:angle,alignmentSum:0,alignmentCount:0};
    attempt.top=Math.max(attempt.top,angle);
    attempt.bottom=Math.min(attempt.bottom,angle);
    if(counter.exercise==='pushup' && Number.isFinite(metrics.alignment) &&
       (metrics.plankConfidence ?? metrics.confidence ?? 0)>=0.45){
      attempt.alignmentSum+=ramp(metrics.alignment,120,175);
      attempt.alignmentCount++;
    }
    const scoreAttempt = a => {
      const depth = 1-ramp(a.bottom,counter.exercise==='squat'?90:85,140);
      const extension = ramp(a.top,140,170);
      const rangeScore = 100*(0.7*depth+0.3*extension);
      return a.alignmentCount ? 0.6*rangeScore+40*a.alignmentSum/a.alignmentCount : rangeScore;
    };
    if (counter.state === 'ready' && angle <= down) counter.state = 'down';
    else if (counter.state === 'down' && angle >= up) {
      counter.state = 'ready'; counter.reps++;
      counter.repQualityTotal=(counter.repQualityTotal??0)+scoreAttempt(attempt);
      counter.attempt={top:angle,bottom:angle,alignmentSum:0,alignmentCount:0};
    }
    counter.feedback = counter.state === 'down' ? (counter.exercise==='squat'?'Stand up to complete the rep.':'Extend your arms to complete the rep.') : (counter.exercise==='squat'?'Bend your knees and lower with control.':'Bend your elbows and lower with control.');
    quality = scoreAttempt(attempt);
  }
  counter.samples++;
  counter.qualityTotal += quality;
  return counter;
}
export function formQuality(counter) {
  if (counter.exercise !== 'plank' && counter.reps && Number.isFinite(counter.repQualityTotal)) return Math.round(counter.repQualityTotal/counter.reps);
  if (counter.exercise!=='plank' && !counter.reps && ['squat','pushup'].includes(counter.exercise)) return 0; // no completed repetition to grade yet
  return counter.samples ? Math.round(counter.qualityTotal / counter.samples) : 0;
}
export function observedCount(counter) {return counter.exercise==='plank' ? Math.round(counter.validSeconds * 10)/10 : counter.reps;}
