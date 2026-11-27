// Distance-friendly workout guidance from browser landmark visibility.
// All geometry is approximate and never used for medical decisions.
const JOINTS = {
  squat:[11,23,25,27],
  pushup:[11,13,15,23,25,27],
  plank:[11,13,15,23,25,27]
};
const VIEWS={
  squat:'Stand sideways or slightly angled; straighten your legs to begin.',
  pushup:'Turn sideways and get into the top of a push-up.',
  plank:'Turn sideways and hold a straight forearm plank.'
};
const MIN_VIS=.37;
const visible = p => !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && (p.visibility ?? 1)>=MIN_VIS;

export function assessFrame(points,exercise='squat'){
  if(!Array.isArray(points)||points.length<29)
    return {kind:'missing',title:'STEP INTO VIEW',detail:'Stand where the camera can see you.'};
  const ids=JOINTS[exercise]||JOINTS.squat;
  // A side-facing person normally has one shoulder/hip/leg obscured.
  // Score left and right independently so the app doesn't demand a front pose.
  const side=ids.map(i=>i+1);
  const sideScore=rows=>rows.filter(i=>visible(points[i])).length;
  const best=sideScore(side)>sideScore(ids)?side:ids;
  const visibleIDs=best.filter(i=>visible(points[i]));
  const torsoPresent=[best[0],best[exercise==='squat'?1:3]].every(i=>visible(points[i]));
  if(visibleIDs.length<3) {
    return {kind:'missing',title:'MOVE INTO FRAME',detail:'Keep your shoulders, hips and legs visible.'};
  }
  const coords=visibleIDs.map(i=>points[i]);
  const clipped=coords.some(p=>p.x<.025||p.x>.975||p.y<.025||p.y>.975);
  const shoulders=[11,12].map(i=>points[i]).filter(visible);
  const ankles=[27,28].map(i=>points[i]).filter(visible);
  const legsOk=ankles.length>0;
  if(clipped || (torsoPresent && !legsOk))
    return {kind:'far',title:'MOVE FARTHER BACK',detail:'Step back until your feet and head fit on screen.'};
  if(visibleIDs.length<best.length-1)
    return {kind:'adjust',title:'ADJUST YOUR CAMERA',detail:'Keep your entire body visible from the side.'};
  if(shoulders.length && ankles.length){
    const torso=shoulders[0];
    const foot=ankles[0];
    if(Math.hypot(torso.x-foot.x,torso.y-foot.y)<.25)
      return {kind:'adjust',title:'MOVE CLOSER',detail:'Move closer while keeping your entire body in view.'};
  }
  return {kind:'ready',title:'BODY IN FRAME',detail:VIEWS[exercise]||VIEWS.squat};
}

export function activityCue({phase='position',frame,ready=false,exercise='squat',seconds=0,feedback='',observed=0,target=10}={}){
  const f=frame||assessFrame(null,exercise);
  if(phase==='countdown'&&ready)
    return {kind:'countdown',title:String(Math.max(1,Math.ceil(seconds))),detail:'Get ready to begin!'};
  if(phase==='position'){
    if(f.kind!=='ready')return f;
    return ready
      ? {kind:'ready',title:'STARTING POSITION FOUND',detail:'Hold still for the countdown.'}
      : {kind:'position',title:'GET INTO POSITION',detail:VIEWS[exercise]||VIEWS.squat};
  }
  if(f.kind==='missing'||f.kind==='far'||f.kind==='adjust')return f;
  if(phase==='active'){
    if(exercise==='plank')return {kind:'active',title:'HOLD YOUR PLANK',detail:feedback||'Keep your body straight.'};
    return {kind:'active',title:'KEEP GOING!',detail:feedback||'Move slowly and with control.'};
  }
  return {kind:'ready',title:'READY TO TRAIN',detail:'Press Start camera.'};
}

export function cueForVoice(cue){
  if(!cue)return '';
  if(cue.kind==='countdown')return cue.title;
  return [cue.title,cue.detail].filter(Boolean).join('. ');
}
