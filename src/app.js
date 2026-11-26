import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { clamp, rating, grade, completionPercent, makeCounter, updateCounter, observedCount, formQuality } from './scoring.js';
import { EXERCISES } from './programs.js';
import { createAdvancedUI } from './advanced-ui.js';
import { extraMetrics, updateExtraCounter, recognizeExercise } from './extra-exercises.js';
import { shouldAutoFinish, workoutCompletionLabel, setCompletionLabel } from './session-flow.js';

const configured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
const siteRedirect = new URL(import.meta.env.BASE_URL, window.location.origin).href;
const api = configured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
const $ = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const niceExercise = Object.fromEntries(Object.entries(EXERCISES).map(([code,data])=>[code,data.label]));
const targetDefaults = Object.fromEntries(Object.entries(EXERCISES).map(([code,data])=>[code,data.target]));
let me = null;
let profile = null;
let currentView = 'home';
let authMode = 'login';
// Guest mode allows a webcam demo without an account; workouts are never saved.
let guestMode = false;
let active = false;
let paused = false;
let pausedAt = 0;
let stream = null;
let landmarker = null;
let requestId = 0;
let counter = null;
let exercise = 'squat';
let target = 10;
let startedAt = 0;
let lastFrame = -1;
let lastInference = 0;
let poseModule = null;
let nextToastTimer;
let advanced=null;
let recognitionHint='';
let recognitionMode=false;
let recognizedExercise=null;
let recognitionStreak=0;
let sessionPhase='idle';
let readySince=null;
let countdownUntil=0;
let finishingWorkout=false;
let lastExport=null;

function toast(message, error = false) {
  const el = $('notice');
  el.textContent = message;
  el.classList.remove('hidden');
  el.classList.toggle('error', error);
  clearTimeout(nextToastTimer);
  nextToastTimer = setTimeout(()=>el.classList.add('hidden'), 6500);
}
function showView(view) {
  if (active && view !== 'workout') { toast('Finish your current workout before leaving the studio.', true); return; }
  if (view === 'admin' && profile?.role !== 'admin') return;
  currentView = view;
  document.querySelectorAll('.view').forEach(el=>el.classList.toggle('hidden', el.id !== `view-${view}`));
  document.querySelectorAll('.nav-item').forEach(el=>el.classList.toggle('active', el.dataset.view === view));
  if (view === 'progress') void loadHistory();
  if (view === 'leaderboard') void loadLeaderboard();
  if (view === 'admin') void loadAdmins();
}
function updateIdentity() {
  const name = profile?.display_name || me?.email?.split('@')[0] || 'Guest preview';
  $('account-name').textContent = name;
  $('account-type').textContent = me ? (profile?.role === 'admin' ? 'Administrator' : 'Member · Cloud synced') : 'Local preview · Not saved';
  $('avatar').textContent = name.slice(0,1).toUpperCase();
  const accountButton = $('sign-out');
  accountButton.classList.toggle('hidden', !configured || (!me && !guestMode));
  accountButton.textContent = me ? 'Sign out ↗' : 'Sign in / Create account ↗';
  $('top-auth').classList.toggle('hidden', !configured || Boolean(me) || !guestMode);
  document.querySelectorAll('.admin-only').forEach(el => el.classList.toggle('hidden', profile?.role !== 'admin'));
  if (currentView === 'admin' && profile?.role !== 'admin') showView('home');
  $('auth-overlay').classList.toggle('hidden', !configured || Boolean(me) || guestMode);
}
async function refreshUser() {
  if (!api) return;
  const { data: {user}, error } = await api.auth.getUser();
  if (error && error.name !== 'AuthSessionMissingError') console.warn('Authentication refresh:', error.message);
  me = user || null;
  if (me) guestMode = false;
  profile = null;
  if (me) {
    const r = await api.from('profiles').select('id,display_name,role').eq('id',me.id).maybeSingle();
    if (r.error) toast(`Profile setup needed: ${r.error.message}`,true);
    else profile = r.data;
  }
  updateIdentity();
  advanced?.loadPrefs();
  await loadOverview();
  if(me)void advanced?.syncAccount();
}
function switchAuth({keepHelp=false}={}) {
  authMode = authMode === 'login' ? 'register' : 'login';
  const isRegister = authMode === 'register';
  $('auth-heading').textContent = isRegister ? 'Create an account' : 'Sign in';
  $('auth-submit').textContent = isRegister ? 'Create account' : 'Sign in';
  $('auth-name').classList.toggle('hidden', !isRegister);
  $('name-label').classList.toggle('hidden', !isRegister);
  $('auth-name').required = isRegister;
  $('auth-password').autocomplete = isRegister ? 'new-password' : 'current-password';
  $('auth-switch').textContent = isRegister ? 'Already have an account? Sign in' : 'New here? Create an account';
  $('auth-error').classList.add('hidden');
  if(!keepHelp){$('auth-help').classList.add('hidden');$('auth-resend').classList.add('hidden');}
}
async function submitAuth(event) {
  event.preventDefault();
  const email=$('auth-email').value.trim().toLowerCase();
  const password=$('auth-password').value;
  const name=$('auth-name').value.trim();
  if(!api)return;
  if(authMode==='register' && name.length<2){
    showAuthError('Enter a name of at least 2 characters.');return;
  }
  $('auth-submit').disabled=true;
  $('auth-error').classList.add('hidden');
  $('auth-help').classList.add('hidden');
  try {
    const result=authMode==='register'
      ? await api.auth.signUp({
          email,password,options:{data:{display_name:name},emailRedirectTo:siteRedirect}
        })
      : await api.auth.signInWithPassword({email,password});
    if(result.error)throw result.error;
    if(authMode==='register'&&!result.data.session){
      $('auth-help').textContent='Account request received. Check your inbox (and spam folder) for a confirmation link, then return here to sign in. If it does not arrive, use Resend confirmation email.';
      $('auth-help').classList.remove('hidden');
      $('auth-resend').classList.remove('hidden');
      switchAuth({keepHelp:true});
    }else{
      await refreshUser();
      toast('Signed in successfully. Welcome'+(name?', '+name:'')+'!');
    }
  }catch(error){
    let message=error.message||'Unable to connect to the account service.';
    if(/email not confirmed/i.test(message)){
      message='Please confirm your email before signing in. Check your inbox and spam folder, or resend the confirmation link.';
      $('auth-resend').classList.remove('hidden');
    }else if(/invalid login credentials/i.test(message))message='Email or password is incorrect. If you just registered, first confirm your email.';
    else if(/rate limit|too many requests/i.test(message))message='Too many attempts. Please try later, or ask the project administrator to check email delivery.';
    showAuthError(message);
  }finally{$('auth-submit').disabled=false;}
}
function showAuthError(message){
  $('auth-error').textContent=message;
  $('auth-error').classList.remove('hidden');
}
async function resendConfirmation(){
  if(!api)return;
  const email=$('auth-email').value.trim().toLowerCase();
  if(!email){showAuthError('Enter your email address above first.');return;}
  $('auth-resend').disabled=true;
  try{
    const {error}=await api.auth.resend({type:'signup',email,options:{emailRedirectTo:siteRedirect}});
    if(error)throw error;
    $('auth-help').textContent='If an account is awaiting verification, another confirmation email has been requested. Check your inbox and spam folder.';
    $('auth-help').classList.remove('hidden');$('auth-error').classList.add('hidden');
  }catch(error){showAuthError(error.message||'Unable to resend confirmation.');}
  finally{$('auth-resend').disabled=false;}
}

async function loadOverview() {
  if (!me) {
    $('stat-workouts').textContent='—';$('stat-best').textContent='—';$('stat-last').textContent='—';
    advanced?.setHistory([]);
    return;
  }
  const { data, error } = await api.from('workouts').select('exercise,rating,created_at').eq('user_id',me.id).order('created_at',{ascending:false}).limit(500);
  if (error) { toast(`Unable to load progress: ${error.message}`,true); return; }
  advanced?.setHistory([...data].reverse());
  $('stat-workouts').textContent=String(data.length);
  $('stat-best').textContent=data.length ? `${Math.max(...data.map(x=>x.rating))}/100` : '—';
  $('stat-last').textContent=data.length ? niceExercise[data[0].exercise] : '—';
}
async function loadHistory() {
  const root = $('history-list');
  if (!me) { root.innerHTML='<div class="empty-state">Sign in to save and view your progress.</div>'; return; }
  root.innerHTML='<div class="empty-state">Loading your sessions…</div>';
  const {data,error}=await api.from('workouts').select('id,exercise,reps,valid_seconds,rating,form_quality,completion,created_at').eq('user_id',me.id).order('created_at',{ascending:false}).limit(100);
  if (error) {root.innerHTML=`<div class="empty-state">${escapeHtml(error.message)}</div>`;return;}
  // The extension migration stores full multi-exercise program sessions.
  // If it has not been installed yet, preserve the original workout history.
  const extra=await api.from('program_sessions')
    .select('id,program_name,rating,form_quality,completion,duration_seconds,created_at')
    .eq('user_id',me.id).order('created_at',{ascending:false}).limit(100);
  const items=[
    ...data.map(row=>({...row,kind:'exercise'})),
    ...(extra.error?[]:extra.data.map(row=>({...row,kind:'program'})))
  ].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,100);
  if (!items.length){root.innerHTML='<div class="empty-state">No workouts yet. Start one in the studio to see your progress here.</div>';return;}
  root.innerHTML=items.map(row=>`<div class="history-row"><div><strong>${escapeHtml(row.kind==='program'?row.program_name:niceExercise[row.exercise]||row.exercise)}</strong><small>${new Date(row.created_at).toLocaleString()} · ${row.kind==='program'?`Full program · ${row.duration_seconds}s · ${row.completion}% completion`:row.exercise==='plank'?`${Number(row.valid_seconds).toFixed(1)} sec`:`${row.reps} reps`} · Form ${row.form_quality}%</small></div><div><span class="rank-score">${row.rating}</span><span class="grade-pill">${grade(row.rating)}</span></div></div>`).join('');
}
async function loadLeaderboard() {
  const root=$('leaderboard-list');
  if (!me) {root.innerHTML='<div class="empty-state">Sign in to see the shared leaderboard.</div>';return;}
  root.innerHTML='<div class="empty-state">Loading the rankings…</div>';
  const {data,error}=await api.rpc('get_leaderboard',{p_exercise:$('rank-exercise').value,p_period:$('rank-period').value});
  if(error){root.innerHTML=`<div class="empty-state">${escapeHtml(error.message)}</div>`;return;}
  if(!data?.length){root.innerHTML='<div class="empty-state">No workouts recorded for these filters yet.</div>';return;}
  root.innerHTML=data.map((x,i)=>`<div class="rank-row"><div><span class="rank-position">${i+1 < 10 ? `0${i+1}`:i+1}</span><span class="rank-person">${escapeHtml(x.display_name)}${x.user_id===me.id?' (you)':''}<small>${Number(x.sessions_count)} saved session${Number(x.sessions_count)===1?'':'s'}</small></span></div><div><span class="rank-score">${x.best_score}</span><span class="grade-pill">${grade(x.best_score)}</span></div></div>`).join('');
}
async function loadAdmins() {
  const root=$('admin-users');
  if(!me || profile?.role!=='admin'){root.innerHTML='<div class="empty-state">Admin access required.</div>';return;}
  root.innerHTML='<div class="empty-state">Loading accounts…</div>';
  const {data,error}=await api.rpc('admin_list_users');
  if(error){root.innerHTML=`<div class="empty-state">${escapeHtml(error.message)}</div>`;return;}
  root.innerHTML=data.map(row=>`<div class="admin-row"><div><strong>${escapeHtml(row.display_name)}${row.role==='admin'?' · ADMIN':''}</strong><small>${escapeHtml(row.email)} · ${row.workout_count} workouts</small></div>${row.id!==me.id?`<button class="admin-delete" data-delete-id="${row.id}" data-delete-name="${escapeHtml(row.display_name)}">Delete</button>`:'<span class="muted">Current account</span>'}</div>`).join('');
  root.querySelectorAll('[data-delete-id]').forEach(button=>button.addEventListener('click',async()=>{
    const name=button.dataset.deleteName, id=button.dataset.deleteId;
    if(!window.confirm(`Permanently delete ${name} and ALL saved workouts? This cannot be undone.`))return;
    if(window.prompt(`Type DELETE to confirm deletion of ${name}:`)!=='DELETE')return;
    button.disabled=true;
    const {error}=await api.rpc('admin_delete_user',{p_target:id});
    if(error)toast(`Could not delete user: ${error.message}`,true);
    else{toast(`Account and saved workouts for ${name} deleted.`);await loadAdmins();}
    button.disabled=false;
  }));
}
function selectExercise(next) {
  if(active)return;
  if(!niceExercise[next])return;
  exercise=next;
  target=targetDefaults[next];
  $('exercise-select').value=next;
  $('target-input').value=target;
  $('target-unit').textContent=EXERCISES[next]?.unit||'repetitions';
  $('live-unit').textContent=next==='plank'?'VALID SECONDS':'REPETITIONS';
  showView('workout');
}
async function makeLandmarker() {
  const { PoseLandmarker, FilesetResolver, DrawingUtils } = poseModule ||= await import('@mediapipe/tasks-vision');
  // Serve the MediaPipe WASM runtime from our own GitHub Pages site, so it
  // always matches the JS version installed during the Vite build.
  const wasmBase = new URL(`${import.meta.env.BASE_URL}wasm`, window.location.origin).href;
  const vision=await FilesetResolver.forVisionTasks(wasmBase);
  const variant=exercise==='plank'?'full':'lite';
  const modelAssetPath=`https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${variant}/float16/1/pose_landmarker_${variant}.task`;
  landmarker=await PoseLandmarker.createFromOptions(vision,{
    baseOptions:{modelAssetPath,delegate:'CPU'},runningMode:'VIDEO',numPoses:1,
    minPoseDetectionConfidence:.5,minPosePresenceConfidence:.5,minTrackingConfidence:.5
  });
  return { PoseLandmarker, DrawingUtils };
}
let renderer=null;
async function startWorkout() {
  if (active) return;
  if (!navigator.mediaDevices?.getUserMedia) {toast('Webcam access requires HTTPS or localhost and a supported browser.',true);return;}
  target=Math.trunc(Number($('target-input').value));
  if(!(target>=1&&target<=300)){toast('Choose a target between 1 and 300.',true);return;}
  exercise=$('exercise-select').value;
  $('workout-start').disabled=true;
  $('camera-status').textContent='STARTING…';
  try {
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:1280},height:{ideal:720}},audio:false});
    const video=$('webcam');
    video.srcObject=stream;
    await video.play();
    // Show the live webcam before loading the pose model so users can tell that
    // camera access succeeded. A pose model error must not masquerade as a permission error.
    $('camera-placeholder').classList.add('hidden');
    $('camera-status').textContent='LOADING POSE TRACKING…';
    renderer=await makeLandmarker();
    counter=makeCounter(exercise);
    if(advanced?.getState().plan){
      // Program set already populated the desired target before camera initialization.
      target=Number($('target-input').value);
    }
    startedAt=performance.now()/1000;
    lastFrame=-1;lastInference=0;
    active=true;paused=false;finishingWorkout=false;
    sessionPhase=recognitionMode?'active':'position';readySince=null;countdownUntil=0;
    $('camera-placeholder').classList.add('hidden');
    document.querySelector('.record-dot').classList.add('live');
    $('camera-status').textContent='LIVE SESSION';
    $('workout-stop').disabled=false;
    $('exercise-select').disabled=true;
    $('target-input').disabled=true;
    setLiveData();
    requestId=requestAnimationFrame(tick);
  }catch(e){
    console.error('Workout initialization failed:', e);
    const detail = e instanceof Error ? e.message : String(e ?? 'Unknown error');
    stopCamera();
    toast(`Unable to start workout: ${detail}. Camera access may be allowed, but pose-tracking resources could not load.`,true);
  }
}
function tick(timestamp) {
  if(!active)return;
  if(paused){requestId=requestAnimationFrame(tick);return;}
  const video=$('webcam');
  const canvas=$('pose-canvas');
  if(video.readyState >= 2 && timestamp-lastInference>95 && video.currentTime!==lastFrame){
    lastInference=timestamp;
    lastFrame=video.currentTime;
    try{
      const result=landmarker.detectForVideo(video,timestamp);
      const points=result.landmarks?.[0];
      canvas.width=video.videoWidth;canvas.height=video.videoHeight;
      const ctx=canvas.getContext('2d');
      ctx.clearRect(0,0,canvas.width,canvas.height);
      if(points?.length){
        const drawer=new renderer.DrawingUtils(ctx);
        drawer.drawConnectors(points,renderer.PoseLandmarker.POSE_CONNECTIONS,{color:'#c6f36b',lineWidth:3});
        drawer.drawLandmarks(points,{color:'#ffad6a',fillColor:'#ffad6a',radius:3});
      }
      const oldReps=counter?.reps??0;
      if(!recognitionMode && sessionPhase!=='active'){
        const m=['lunge','curl','jack'].includes(exercise)?extraMetrics(points,exercise):getMetrics(points);
        const confidence=m?.[exercise==='squat'?'squatConfidence':exercise==='pushup'?'pushupConfidence':'plankConfidence']??m?.confidence??0;
        const knee=Number(m?.knee),elbow=Number(m?.elbow);
        const ready=confidence>=.45 && (
          exercise==='squat'?knee>145:
          exercise==='pushup'?elbow>135:
          exercise==='plank'?Number(m?.alignment)>150:
          ['lunge','curl','jack'].includes(exercise)?true:false
        );
        if(sessionPhase==='position'){
          readySince=ready?(readySince??timestamp):null;
          if(ready&&timestamp-readySince>=600){
            sessionPhase='countdown';countdownUntil=timestamp+3000;
          }
        }else if(sessionPhase==='countdown'){
          if(!ready){sessionPhase='position';readySince=null;}
          else if(timestamp>=countdownUntil){
            sessionPhase='active';
            startedAt=performance.now()/1000;
            if(counter)counter.lastTime=null;
          }
        }
        if(sessionPhase!=='active'){
          $('camera-status').textContent=sessionPhase==='countdown'?'GET READY':'FIND START POSITION';
          $('coach-feedback').textContent=sessionPhase==='countdown'?
            ('Starting in '+Math.max(1,Math.ceil((countdownUntil-timestamp)/1000))+'…'):
            ('Hold your starting position in the '+(EXERCISES[exercise]?.view||'recommended')+' view.');
          $('pose-state').textContent=ready?'READY':'ADJUST POSITION';
          requestId=requestAnimationFrame(tick);
          return;
        }
        $('camera-status').textContent='LIVE SESSION';
      }
      if(recognitionMode){
        const detected=recognizeExercise(points);
        const candidate=detected.exercise==='idle'?null:detected.exercise;
        recognitionStreak=candidate && candidate===recognizedExercise?recognitionStreak+1:1;
        recognizedExercise=candidate;
        const stable=recognizedExercise&&recognitionStreak>=6;
        const targetButton=$('advanced-choose-detected');
        if(targetButton)targetButton.disabled=!stable;
        $('advanced-recognition-status').textContent=stable?
          ('Suggested: '+niceExercise[recognizedExercise]+' (experimental). Confirm to continue.') :
          (candidate?('Checking '+niceExercise[candidate]+'… hold the pose.'):'Move fully into frame.');
        $('pose-state').textContent=points?.length?'POSE DETECTED':'MOVE INTO FRAME';
        requestId=requestAnimationFrame(tick);
        return;
      }
      const m=['lunge','curl','jack'].includes(exercise)?extraMetrics(points,exercise):getMetrics(points);
      if(['lunge','curl','jack'].includes(exercise))updateExtraCounter(counter,m,timestamp/1000);
      else updateCounter(counter,m,timestamp/1000);
      advanced?.onFrame(points,m,counter,timestamp/1000);
      advanced?.onRep(oldReps,counter.reps,counter,timestamp/1000);
      const hint=recognizeExercise(points);
      recognitionHint=hint.exercise==='idle'?'Movement not identified':('Possible '+(niceExercise[hint.exercise]||hint.exercise));
      if(shouldAutoFinish(counter,target,sessionPhase,finishingWorkout)){
        // Works for individual workouts AND guided-program sets.
        // Stop counting at the completed-rep/valid-hold target.
        void finishWorkout({automatic:true});
        return;
      }
      $('pose-state').textContent=m?.confidence>=.45?'BODY TRACKED':'MOVE INTO FRAME';
      setLiveData();
    }catch(e){
      console.error(e);
      toast(`Pose tracking stopped: ${e.message}`,true);
      stopCamera();return;
    }
  }
  requestId=requestAnimationFrame(tick);
}
// Static import keeps this in the same UI thread without uploading camera frames.
import {getMotionAngles as getMetrics} from './scoring.js';
function setLiveData(){
  if(!counter)return;
  $('live-count').textContent=counter.exercise==='plank'?counter.validSeconds.toFixed(1):String(counter.reps);
  $('live-elapsed').textContent=formatTime((performance.now()/1000)-startedAt);
  $('live-quality').textContent=counter.samples?`${formQuality(counter)} / 100`:'—';
  $('live-tracking').textContent=counter.samples?`${counter.samples} frames`:'Waiting';
  $('coach-feedback').textContent=counter.feedback;
  const status = $('advanced-recognition-status');
  if(status)status.textContent=recognitionHint;
}
function formatTime(seconds){const n=Math.max(0,Math.floor(seconds));return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;}
function togglePause(){
  if(!active)return toast('Start the camera before pausing.',true);
  if(!paused){paused=true;pausedAt=performance.now();$('camera-status').textContent='PAUSED';}
  else{
    paused=false;startedAt+=(performance.now()-pausedAt)/1000;
    if(sessionPhase==='countdown')countdownUntil+=performance.now()-pausedAt;
    if(sessionPhase==='position')readySince=null;
    if(counter)counter.lastTime=null;
    $('camera-status').textContent='LIVE SESSION';
  }
}
function stopCamera(){
  advanced?.onStop();
  active=false;paused=false;sessionPhase='idle';readySince=null;
  if(recognitionMode){
    recognitionMode=false;recognizedExercise=null;recognitionStreak=0;
    $('advanced-auto-info')?.classList.add('hidden');
  }
  cancelAnimationFrame(requestId);
  if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}
  $('webcam').srcObject=null;
  if(landmarker){landmarker.close();landmarker=null;}
  $('pose-canvas').getContext('2d')?.clearRect(0,0,$('pose-canvas').width,$('pose-canvas').height);
  $('camera-placeholder').classList.remove('hidden');
  $('workout-start').disabled=false;
  $('workout-stop').disabled=true;
  $('exercise-select').disabled=false;
  $('target-input').disabled=false;
  document.querySelector('.record-dot').classList.remove('live');
  $('camera-status').textContent='CAMERA OFF';
  $('pose-state').textContent='No pose yet';
}
async function finishWorkout({automatic=false}={}){
  if(recognitionMode){toast('Select an exercise before starting.',true);return;}
  if(!active || !counter || finishingWorkout)return;
  finishingWorkout=true;
  const reached=shouldAutoFinish(counter,target,sessionPhase,false);
  const endedEarly=!automatic && !reached;
  const exerciseUsed=counter.exercise;
  const achieved=observedCount(counter);
  const quality=formQuality(counter);
  const completion=completionPercent(achieved,target);
  const score=rating(quality,completion);
  stopCamera();
  $('summary-grade').textContent=grade(score);
  $('summary-rating').textContent=`${score} / 100`;
  $('summary-exercise').textContent=niceExercise[exerciseUsed];
  $('summary-completed').textContent=`${achieved}${exerciseUsed==='plank'?' sec':' reps'}`;
  $('summary-quality').textContent=`${quality}%`;
  $('summary-completion').textContent=`${completion}%`;
  $('summary-leaders').innerHTML='';
  const detail={exercise:exerciseUsed,reps:Math.round(counter.reps),valid_seconds:counter.validSeconds,
    target,form_quality:quality,completion,score,observed:counter.samples,
    goodSeconds:Math.round(counter.samples*quality/100)};
  const outcome=advanced?.onCompleted(detail,{endedEarly})||{inProgram:false,finished:reached,endedEarly};
  const full=outcome.summary;
  const showResults=!outcome.inProgram||outcome.finished;
  if(showResults)lastExport=full?
    {...full,endedEarly,exportedAt:new Date().toISOString(),educationalPrototype:true}:
    {...detail,endedEarly,exportedAt:new Date().toISOString(),educationalPrototype:true};
  if(outcome.inProgram && !outcome.finished){
    // Completing a guided-program set automatically starts the rest timer.
    // Do not interrupt that rest with a blocking dialog.
    toast(setCompletionLabel({completed:true,program:true}));
  }else{
    $('summary-heading').textContent=workoutCompletionLabel({program:Boolean(outcome.inProgram),endedEarly});
    if(full){
      $('summary-grade').textContent=grade(full.score);
      $('summary-rating').textContent=full.score+' / 100';
      $('summary-exercise').textContent=full.program;
      $('summary-completed').textContent=full.exercises.length+' of '+(full.completed?full.exercises.length:(advanced?.getState()?.lastSummary?.exercises.length||full.exercises.length))+' sets recorded';
      $('summary-quality').textContent=full.quality+'%';
      $('summary-completion').textContent=full.completion+'%';
      $('summary-leaders').innerHTML='<strong>EXERCISE GRADES</strong><div>'+
        full.exercises.map(e=>escapeHtml(niceExercise[e.exercise]||e.exercise)+': '+e.score+'/100 ('+grade(e.score)+')').join('<div></div>')+'</div>';
    }
    $('summary-save-status').textContent=me?'Saving your results…':'Guest demo: results are not saved.';
    $('summary-dialog').showModal();
  }
  if(!me)return;
  const {error}=await api.from('workouts').insert({
    user_id:me.id,exercise:exerciseUsed,target,reps:exerciseUsed==='plank'?0:Math.round(achieved),
    valid_seconds:exerciseUsed==='plank'?achieved:0,form_quality:quality,completion,
  });
  if(error){
    toast('Could not save exercise: '+error.message,true);
    if(showResults)$('summary-save-status').textContent='Could not save: '+error.message;
    return;
  }
  if(showResults)$('summary-save-status').textContent='✓ Results saved to your profile.';
  await loadOverview();
  if(!outcome.inProgram){
    const {data}=await api.rpc('get_leaderboard',{p_exercise:exerciseUsed,p_period:'all'});
    if(data?.length)$('summary-leaders').innerHTML='<strong>Top leaderboard entries:</strong><div>'+
      data.slice(0,3).map((row,i)=>`${i+1}. ${escapeHtml(row.display_name)} — ${row.best_score}/100`).join('<div></div>')+'</div>';
  }
}
function wireEvents(){
  document.querySelectorAll('.nav-item').forEach(btn=>btn.addEventListener('click',()=>showView(btn.dataset.view)));
  document.querySelectorAll('.exercise-card').forEach(btn=>btn.addEventListener('click',()=>selectExercise(btn.dataset.exercise)));
  $('hero-start').addEventListener('click',()=>showView('workout'));
  $('exercise-select').addEventListener('change',e=>selectExercise(e.target.value));
  $('workout-start').addEventListener('click',startWorkout);
  $('workout-stop').addEventListener('click',()=>void finishWorkout({automatic:false}));
  $('rank-exercise').addEventListener('change',loadLeaderboard);
  $('rank-period').addEventListener('change',loadLeaderboard);
  $('auth-form').addEventListener('submit',submitAuth);
  $('auth-switch').addEventListener('click',()=>switchAuth());
  $('auth-resend').addEventListener('click',resendConfirmation);
  $('guest-start').addEventListener('click',()=>{
    guestMode=true;
    updateIdentity();
    showView('home');
    toast('Guest demo enabled. Workouts will not be saved to an account.');
  });
  const openLogin=()=>{ if(active){toast('Finish the workout before signing in.',true);return;} guestMode=false; updateIdentity(); };
  $('top-auth').addEventListener('click',openLogin);
  $('sign-out').addEventListener('click',async()=>{
    if(!me){openLogin();return;}
    if(active)stopCamera();
    const {error}=await api.auth.signOut();
    if(error){toast(error.message,true);return;}
    me=null;profile=null;guestMode=true;updateIdentity();await loadOverview();showView('home');
    toast('Signed out. Guest demo remains available without saving sessions.');
  });
  $('summary-done').addEventListener('click',()=>{
    $('summary-dialog').close();
    showView('home');
    if(advanced?.getState()?.lastSummary){
      document.getElementById('advanced-program-results')?.scrollIntoView({block:'start',behavior:'smooth'});
    }
  });
  $('summary-close').addEventListener('click',()=>$('summary-dialog').close());
  $('summary-export').addEventListener('click',()=>{
    if(!lastExport)return;
    const filename='fitness-workout-'+new Date().toISOString().slice(0,10)+'.json';
    const blob=new Blob([JSON.stringify(lastExport,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const anchor=document.createElement('a');anchor.href=url;anchor.download=filename;
    document.body.appendChild(anchor);anchor.click();anchor.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1500);
  });
  window.addEventListener('beforeunload',()=>{if(stream)stream.getTracks().forEach(t=>t.stop());});
}
async function init(){
  advanced=createAdvancedUI({
    showView,selectExercise,togglePause,finishEarly:()=>void finishWorkout({automatic:false}),
    getExercise:()=>exercise,
    getUser:()=>me,
    isActive:()=>active,
    toast,
    startRecognition:()=>{
      if(active)return toast('Finish the current workout first.',true);
      recognitionMode=true;recognizedExercise=null;recognitionStreak=0;
      selectExercise('squat');
      $('advanced-auto-info').classList.remove('hidden');
      $('advanced-recognition-status').textContent='Starting camera…';
      $('advanced-choose-detected').disabled=true;
      toast('Experimental recognition: hold a squat, push-up, or plank pose. Confirm the suggestion manually.');
      void startWorkout();
    },
    cancelRecognition:()=>{
      if(!recognitionMode)return;
      stopCamera();
      toast('Recognition cancelled. Select any exercise to begin.');
    },
    useRecognition:()=>{
      if(!recognizedExercise||recognitionStreak<6)return;
      const chosen=recognizedExercise;
      stopCamera();recognitionMode=false;recognizedExercise=null;
      $('advanced-auto-info').classList.add('hidden');
      selectExercise(chosen);
      toast('Suggested exercise selected: '+niceExercise[chosen]+'. Choose a target and press Start camera.');
    },
    loadSettings:async()=>{
      if(!me)return null;
      const {data,error}=await api.from('user_preferences').select('voice,adaptive,calibrate').eq('user_id',me.id).maybeSingle();
      if(error)throw error;return data;
    },
    saveSettings:async(settings)=>{
      if(!me)return;
      const {error}=await api.from('user_preferences').upsert({
        user_id:me.id,voice:settings.voice,adaptive:settings.adaptive,calibrate:settings.calibrate
      },{onConflict:'user_id'});
      if(error)throw error;
    },
    loadCustom:async()=>{
      if(!me)return null;
      const {data,error}=await api.from('user_programs').select('program').eq('user_id',me.id).maybeSingle();
      if(error)throw error;return data;
    },
    saveCustom:async(program)=>{
      if(!me)return;
      const {error}=await api.from('user_programs').upsert({user_id:me.id,program},{onConflict:'user_id'});
      if(error)throw error;
    },
    loadProgramHistory:async()=>{
      if(!me)return [];
      const {data,error}=await api.from('program_sessions')
        .select('program_name,form_quality,completion,rating,created_at').eq('user_id',me.id)
        .order('created_at',{ascending:false}).limit(30);
      if(error)throw error;return [...data].reverse();
    },
    saveProgram:async(summary)=>{
      if(!me)return; // Guest session summaries are transient and not stored.
      const {error}=await api.from('program_sessions').insert({
        user_id:me.id,program_name:summary.program,rating:summary.score,
        form_quality:summary.quality,completion:summary.completion,
        duration_seconds:summary.duration,
        exercise_results:summary.exercises.map(x=>({
          exercise:x.exercise,target:x.target,reps:x.reps,valid_seconds:x.valid_seconds,
          quality:x.form_quality,completion:x.completion,score:x.score
        }))
      });
      if(error)throw error;
    }
  });
  advanced.render();
  wireEvents();
  showView('home');
  if(!configured){
    $('global-banner').textContent='PREVIEW MODE — Webcam analysis is available, but accounts, shared history, and leaderboard require a Supabase project. Follow README.md and supabase/schema.sql to activate them.';
    $('global-banner').classList.remove('hidden');
    updateIdentity();
  }else{
    api.auth.onAuthStateChange((_event,session)=>{
      // Avoid Supabase queries inside the auth callback; schedule after auth state settles.
      setTimeout(()=>{ if(session?.user?.id !== me?.id || !session) void refreshUser(); },0);
    });
    await refreshUser();
  }
}
void init();
