// Dimitri V2/V3 feature port: programs, custom builder, preference controls,
// observational analytics and ephemeral pose replay. Camera is never uploaded.
import {PRESETS, EXERCISES, clonePlan, validatePlan, adaptPlan, summarizePlan, motionSummary, referencePose, grade} from './programs.js';

const byId=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const label=ex=>EXERCISES[ex]?.label||ex;
export function createAdvancedUI(hooks){
  const state={plan:null,index:0,results:[],startedAt:0,restHandle:null,restUntil:0,history:[],
    poses:[],attempts:[],previousPose:null,previousAngle:null,attemptStart:null,lastFrameTime:0,
    settings:{voice:false,adaptive:false,calibrate:false},selectedBuilder:[],calibration:[],
    bestDisplay:'',active:false,comparison:false,latestPoints:null,coachLast:'',lastVoice:0};
  const store=()=>{
    const user=hooks.getUser?.();return 'motionlab_v3_'+(user?.id||'guest');
  };
  function updatePrefsDisplay(){
    for(const key of Object.keys(state.settings)){
      const checkbox=byId('advanced-'+key);
      if(checkbox)checkbox.checked=state.settings[key];
    }
  }
  function loadPrefs(){
    try {state.settings={voice:false,adaptive:false,calibrate:false,...JSON.parse(localStorage.getItem(store()+'_preferences')||'{}')};}
    catch {state.settings={voice:false,adaptive:false,calibrate:false};}
    updatePrefsDisplay();
  }
  async function syncAccount(){
    loadPrefs();
    if(!hooks.getUser())return;
    try {
      const [preferences,program,sessions]=await Promise.all([
        hooks.loadSettings?.(),hooks.loadCustom?.(),hooks.loadProgramHistory?.()
      ]);
      if(preferences){
        state.settings={voice:Boolean(preferences.voice),adaptive:Boolean(preferences.adaptive),calibrate:Boolean(preferences.calibrate)};
        updatePrefsDisplay();
        localStorage.setItem(store()+'_preferences',JSON.stringify(state.settings));
      }
      if(program?.program)localStorage.setItem(store()+'_custom',JSON.stringify(program.program));
      if(sessions?.length){
        state.history=[...state.history,...sessions.map(x=>({program:x.program_name,quality:x.form_quality,completion:x.completion,score:x.rating,created_at:x.created_at}))];
      }
    }catch(e){
      // Previous schema is still usable until extension SQL is installed.
      console.info('Additional profile preferences not yet synced:',e.message);
    }
  }
  function savePrefs(){
    for(const key of Object.keys(state.settings))state.settings[key]=Boolean(byId('advanced-'+key)?.checked);
    localStorage.setItem(store()+'_preferences',JSON.stringify(state.settings));
    if(hooks.getUser())void hooks.saveSettings?.(state.settings).catch(e=>console.info('Settings stored locally:',e.message));
    hooks.toast?.(hooks.getUser()?'Preferences saved (cloud sync if configured).':'Guest preferences saved in this browser.');
  }
  function getCustom(){
    try{return JSON.parse(localStorage.getItem(store()+'_custom')||'null');}catch{return null;}
  }
  function saveCustom(p){
    localStorage.setItem(store()+'_custom',JSON.stringify(p));state.custom=p;
    if(hooks.getUser())void hooks.saveCustom?.(p).catch(e=>console.info('Custom plan stored locally:',e.message));
  }
  function setHistory(rows){state.history=Array.isArray(rows)?rows:[];}
  function startPlan(input){
    if(hooks.isActive())return hooks.toast?.('Finish the current exercise first.',true);
    try{
      let plan=validatePlan(input);
      if(state.settings.adaptive){
        const adapted=adaptPlan(plan,state.history);
        plan=adapted.plan;
        hooks.toast?.(adapted.note);
      }
      state.plan=plan;state.index=0;state.results=[];state.startedAt=Date.now();
      state.poses=[];state.attempts=[];state.previousPose=null;state.previousAngle=null;
      stopRest();setStep();
      hooks.showView('workout');
    }catch(e){hooks.toast?.(e.message,true);}
  }
  function setStep(){
    if(!state.plan)return;
    const step=state.plan.exercises[state.index];
    hooks.selectExercise(step.name);
    byId('target-input').value=step.target;
    const unit=EXERCISES[step.name]?.unit||'reps';
    byId('target-unit').textContent=unit;
    byId('advanced-program-live').classList.remove('hidden');
    byId('advanced-program-live').innerHTML=
      '<div class="eyebrow">PROGRAM SESSION</div><strong>'+esc(state.plan.name)+'</strong>'+
      '<p>Exercise '+(state.index+1)+' of '+state.plan.exercises.length+': '+esc(label(step.name))+
      ' · '+step.target+' '+unit+'</p><small>Start camera when positioned. This is the current set.</small>';
    state.calibration=[];
    speak('Next exercise: '+label(step.name),true);
  }
  function stopRest(){if(state.restHandle){clearInterval(state.restHandle);state.restHandle=null;}}
  function startRest(){
    if(!state.plan)return;
    stopRest();
    let rest=state.plan.rest;
    if(state.settings.adaptive&&state.results.length){
      const recent=state.results.at(-1);
      if(recent.attempts?.length>=6&&recent.motion?.performance_change?.decline)rest+=15;
    }
    state.restUntil=Date.now()+rest*1000;
    const region=byId('advanced-rest');region.classList.remove('hidden');
    function renderRest(){
      const remaining=Math.max(0,Math.ceil((state.restUntil-Date.now())/1000));
      region.innerHTML='<strong>Rest before next exercise: '+remaining+'s</strong>'+
      '<p>Relax, then get ready for '+esc(label(state.plan.exercises[state.index].name))+'.</p>'+
      '<button id="advanced-skip-rest" class="secondary-btn" type="button">Skip rest</button> '+
      '<button id="advanced-add-rest" class="secondary-btn" type="button">+15 seconds</button>';
      byId('advanced-skip-rest').onclick=()=>finishRest();
      byId('advanced-add-rest').onclick=()=>{state.restUntil+=15000;renderRest();};
      if(remaining===0)finishRest();
    }
    function finishRest(){stopRest();region.classList.add('hidden');setStep();hooks.showView('workout');}
    state.restHandle=setInterval(renderRest,1000);renderRest();
    speak('Time to rest',true);
  }
  function onCompleted(row){
    if(!state.plan)return false;
    const step=state.plan.exercises[state.index];
    const result={...row,exercise:step.name,target:step.target,
      grade:grade(row.score),attempts:state.attempts.slice(),motion:motionSummary(state.attempts)};
    state.results.push(result);
    state.index+=1;
    if(state.index<state.plan.exercises.length)startRest();
    else{
      const summary=summarizePlan(state.plan,state.results,(Date.now()-state.startedAt)/1000);
      renderProgramSummary(summary);
      void hooks.saveProgram?.(summary).catch(e=>hooks.toast?.('Program history could not be saved: '+e.message,true));
      state.plan=null;byId('advanced-program-live').classList.add('hidden');
      speak('Workout complete. Review your results.',true);
    }
    return true;
  }
  function renderProgramSummary(summary){
    const root=byId('advanced-program-results');
    root.classList.remove('hidden');
    root.innerHTML='<div class="section-title"><div><div class="eyebrow">PROGRAM COMPLETE</div><h2>'+esc(summary.program)+'</h2></div></div>'+
     '<div class="metrics-grid"><div class="stat-card"><span>OVERALL RATING</span><strong>'+summary.score+'/100 · '+grade(summary.score)+'</strong></div>'+
     '<div class="stat-card"><span>FORM QUALITY</span><strong>'+summary.quality+'%</strong></div>'+
     '<div class="stat-card"><span>COMPLETION</span><strong>'+summary.completion+'%</strong></div></div>'+
     '<div class="panel card-surface">'+summary.exercises.map(x=>'<div class="history-row"><strong>'+esc(label(x.exercise))+'</strong>'+
     '<span>'+x.score+'/100 · '+grade(x.score)+' · '+x.completion+'% completed</span></div>').join('')+
     '<p class="disclaimer">Experimental coaching scores; not a clinical assessment.</p></div>';
  }
  function speak(text,important=false){
    if(!state.settings.voice||!('speechSynthesis' in window))return;
    const now=Date.now();
    if(!important && (text===state.coachLast||now-state.lastVoice<4500))return;
    state.coachLast=text;state.lastVoice=now;
    if(important)window.speechSynthesis.cancel();
    const utterance=new SpeechSynthesisUtterance(text);utterance.rate=1.03;utterance.volume=.75;
    window.speechSynthesis.speak(utterance);
  }
  function onFrame(points,metrics,counter,stamp){
    state.latestPoints=points;
    if(!points?.length||!metrics||!counter)return;
    if(state.settings.calibrate&&state.calibration.length<20&&Number.isFinite(metrics.knee||metrics.elbow)){
      const angle=counter.exercise==='squat'?metrics.knee:metrics.elbow;
      if(Number.isFinite(angle)&&angle>140){
        state.calibration.push(angle);
        if(state.calibration.length===20){
          const sorted=[...state.calibration].sort((a,b)=>a-b);
          const baseline=sorted[10];
          counter.calibration={up:Math.min(160,Math.max(145,baseline-8))};
          hooks.toast?.('Personal starting-angle calibration applied.');
        }
      }
    }
    if(stamp-state.lastFrameTime>=.09){
      state.lastFrameTime=stamp;
      const sample={t:stamp,pose:points.map((p,i)=>p&&p.visibility>.45?{i,x:p.x,y:p.y}:null).filter(Boolean),
        angle:counter.exercise==='squat'?metrics.knee:metrics.elbow,feedback:counter.feedback};
      state.poses.push(sample);if(state.poses.length>240)state.poses.shift();
      if(state.previousAngle!=null&&Number.isFinite(sample.angle)&&Number.isFinite(state.previousAngle)&&counter.exercise!=='plank'){
        const delta=Math.abs(sample.angle-state.previousAngle);
        if(!state.attemptStart&&delta>12)state.attemptStart={time:stamp,angles:[sample.angle]};
        if(state.attemptStart){
          state.attemptStart.angles.push(sample.angle);
          if(state.attemptStart.angles.length>180)state.attemptStart=null;
        }
      }
      state.previousAngle=sample.angle;
    }
    speak(counter.feedback);
  }
  function onRep(prev,next,counter,stamp){
    if(next<=prev||!state.attemptStart)return;
    const arr=state.attemptStart.angles;
    state.attempts.push({complete:true,seconds:Math.max(.1,stamp-state.attemptStart.time),
       range:Math.max(...arr)-Math.min(...arr),quality:Math.max(0,Math.min(100,Math.round(counter.qualityTotal/Math.max(1,counter.samples))))});
    state.attemptStart=null;
    speak(String(next),true);
  }
  function onStop(){
    state.calibration=[];state.previousAngle=null;
    if('speechSynthesis' in window)window.speechSynthesis.cancel();
  }
  function cancelPlan(){if(!state.plan)return;stopRest();state.plan=null;byId('advanced-program-live').classList.add('hidden');byId('advanced-rest').classList.add('hidden');}
  function cancelRest(){stopRest();}
  function builder(){
    const root=byId('advanced-builder');
    root.classList.remove('hidden');
    const custom=getCustom();
    state.selectedBuilder=clonePlan(custom?.exercises||[{name:'squat',target:10},{name:'pushup',target:5},{name:'plank',target:20}]);
    function draw(){
      const options=Object.entries(EXERCISES).map(([k,v])=>'<option value="'+k+'">'+v.label+'</option>').join('');
      root.innerHTML='<div class="panel card-surface"><div class="section-title"><div><div class="eyebrow">DIMITRI V2 FEATURE</div><h2>Custom workout builder</h2></div></div>'+
       '<label class="form-label">Workout name <input id="advanced-plan-name" maxlength="70" value="'+esc(custom?.name||'My custom workout')+'"></label>'+
       '<label class="form-label">Rest between sets (seconds) <input id="advanced-plan-rest" type="number" min="0" max="300" value="'+Number(custom?.rest??25)+'"></label>'+
       '<div id="advanced-set-list">'+state.selectedBuilder.map((x,i)=>
         '<div class="advanced-set"><span>#'+(i+1)+'</span><select data-set-ex="'+i+'">'+options.replace('value="'+x.name+'"','value="'+x.name+'" selected')+
         '</select><input type="number" data-set-target="'+i+'" min="1" max="300" value="'+x.target+'" aria-label="Exercise target">'+
         '<button type="button" data-set-up="'+i+'" aria-label="Move up">↑</button><button type="button" data-set-down="'+i+'" aria-label="Move down">↓</button>'+
         '<button type="button" data-set-remove="'+i+'" aria-label="Remove set">×</button></div>').join('')+'</div>'+
       '<div class="advanced-actions"><button id="advanced-add-set" type="button" class="secondary-btn">+ Add set (max 12)</button> '+
       '<button id="advanced-save-plan" type="button" class="secondary-btn">Save workout</button> '+
       '<button id="advanced-run-plan" type="button" class="primary-btn">Start workout</button></div>'+
       '<p class="disclaimer">Saved custom programs are stored in this browser for each signed-in identity (not yet synced across devices).</p></div>';
      root.querySelectorAll('[data-set-ex]').forEach(el=>el.onchange=()=>{state.selectedBuilder[Number(el.dataset.setEx)].name=el.value;});
      root.querySelectorAll('[data-set-target]').forEach(el=>el.oninput=()=>{state.selectedBuilder[Number(el.dataset.setTarget)].target=Number(el.value);});
      root.querySelectorAll('[data-set-remove]').forEach(el=>el.onclick=()=>{if(state.selectedBuilder.length>1){state.selectedBuilder.splice(Number(el.dataset.setRemove),1);draw();}});
      root.querySelectorAll('[data-set-up]').forEach(el=>el.onclick=()=>move(Number(el.dataset.setUp),-1));
      root.querySelectorAll('[data-set-down]').forEach(el=>el.onclick=()=>move(Number(el.dataset.setDown),1));
      function move(i,n){const j=i+n;if(j<0||j>=state.selectedBuilder.length)return;[state.selectedBuilder[i],state.selectedBuilder[j]]=[state.selectedBuilder[j],state.selectedBuilder[i]];draw();}
      const plan=()=>validatePlan({name:byId('advanced-plan-name').value,rest:Number(byId('advanced-plan-rest').value),exercises:state.selectedBuilder});
      byId('advanced-add-set').onclick=()=>{if(state.selectedBuilder.length>=12)return hooks.toast?.('Maximum 12 sets.',true);state.selectedBuilder.push({name:'squat',target:10});draw();};
      byId('advanced-save-plan').onclick=()=>{try{saveCustom(plan());hooks.toast?.('Custom program saved in this browser.');}catch(e){hooks.toast?.(e.message,true);}};
      byId('advanced-run-plan').onclick=()=>{try{const p=plan();saveCustom(p);root.classList.add('hidden');startPlan(p);}catch(e){hooks.toast?.(e.message,true);}};
    }
    draw();root.scrollIntoView({block:'start',behavior:'smooth'});
  }
  function analytics(){
    const root=byId('advanced-analytics');
    root.classList.remove('hidden');
    const history=state.history.slice(-12);
    const bars=history.map(x=>'<div class="advanced-bar" title="'+esc(x.program||x.exercise||'Workout')+' · '+Number(x.rating??x.score)+' / 100" style="height:'+(Math.max(2,Number(x.rating??x.score)||0))+'%"></div>').join('');
    const motion=motionSummary(state.attempts);
    root.innerHTML='<div class="panel card-surface"><div class="section-title"><div><div class="eyebrow">PERFORMANCE INTELLIGENCE</div><h2>Recent workout scores</h2></div></div>'+
     '<div class="advanced-bars">'+(bars||'<p>No saved workouts yet. Try a session first.</p>')+'</div>'+
     '<div class="metrics-grid"><div class="stat-card"><span>MEAN REP TEMPO</span><strong>'+(motion.avg_tempo??'—')+'s</strong></div>'+
     '<div class="stat-card"><span>MEAN ANGLE RANGE</span><strong>'+(motion.avg_range??'—')+'°</strong></div>'+
     '<div class="stat-card"><span>OBSERVED CHANGE</span><strong>'+(motion.performance_change?.decline?'Consider rest':'—')+'</strong></div></div>'+
     '<p class="disclaimer">These values are observational movement proxies, not physiological measurements or medical predictions.</p></div>';
    root.scrollIntoView({block:'start',behavior:'smooth'});
  }
  function drawSkeleton(ctx,landmarks,color){
    if(!landmarks?.length)return;
    const dict=new Map(landmarks.map(p=>[Number(p.i),p]));
    const edges=[[11,13],[13,15],[12,14],[14,16],[11,12],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28],[23,25],[11,23]];
    const w=ctx.canvas.width,h=ctx.canvas.height;
    ctx.lineWidth=3;ctx.strokeStyle=color;ctx.fillStyle=color;
    for(const [a,b] of edges){const p=dict.get(a),q=dict.get(b);if(!p||!q)continue;ctx.beginPath();ctx.moveTo(p.x*w,p.y*h);ctx.lineTo(q.x*w,q.y*h);ctx.stroke();}
    for(const p of dict.values()){ctx.beginPath();ctx.arc(p.x*w,p.y*h,3,0,7);ctx.fill();}
  }
  function comparison(){
    state.comparison=!state.comparison;
    const wrap=byId('advanced-comparison');wrap.classList.toggle('hidden',!state.comparison);
    if(!state.comparison)return;
    const can=byId('advanced-reference');const ctx=can.getContext('2d');
    ctx.clearRect(0,0,can.width,can.height);
    const ref=referencePose(hooks.getExercise(),.5);
    drawSkeleton(ctx,Object.entries(ref).map(([i,p])=>({i,x:p[0],y:p[1]})),'#73cfff');
  }
  function replay(){
    const root=byId('advanced-replay');
    root.classList.remove('hidden');
    if(!state.poses.length){root.innerHTML='<p class="panel card-surface">No tracked pose sequence yet. Start a workout and move first.</p>';return;}
    root.innerHTML='<div class="panel card-surface"><h2>Landmark replay (not a recorded video)</h2>'+
      '<canvas id="advanced-replay-canvas" width="700" height="310"></canvas>'+
      '<input id="advanced-replay-range" type="range" min="0" max="'+(state.poses.length-1)+'" value="0" style="width:100%">'+
      '<button id="advanced-replay-play" type="button" class="secondary-btn">Play / Pause</button>'+
      '<p id="advanced-replay-description"></p></div>';
    const canvas=byId('advanced-replay-canvas'),slider=byId('advanced-replay-range');let timer=null;
    const draw=()=>{
      const sample=state.poses[Number(slider.value)];
      const ctx=canvas.getContext('2d');ctx.fillStyle='#0c171d';ctx.fillRect(0,0,canvas.width,canvas.height);
      drawSkeleton(ctx,sample.pose,'#c6f36b');
      byId('advanced-replay-description').textContent='Frame '+(Number(slider.value)+1)+' / '+state.poses.length+
        ' · angle '+(Number.isFinite(sample.angle)?sample.angle.toFixed(0)+'°':'—')+' · '+sample.feedback;
    };
    slider.oninput=draw;draw();
    byId('advanced-replay-play').onclick=()=>{
      if(timer){clearInterval(timer);timer=null;return;}
      timer=setInterval(()=>{
        if(!canvas.isConnected){clearInterval(timer);timer=null;return;}
        slider.value=(Number(slider.value)+1)%state.poses.length;draw();
      },180);
    };
    root.scrollIntoView({block:'start',behavior:'smooth'});
  }
  function render(){
    const home=byId('view-home');
    const section=home.querySelector('.exercise-grid');
    const container=document.createElement('section');container.className='advanced-home';
    container.innerHTML='<div class="section-title"><div><div class="eyebrow">DIMITRI ORIGINAL V2</div><h2>Guided training programs</h2></div></div>'+
      '<div class="advanced-program-grid">'+PRESETS.map((p,i)=>'<article class="panel card-surface"><div class="eyebrow">LEVEL '+(i+1)+'</div><h3>'+p.name+'</h3><p>'+p.description+'</p>'+
      '<div class="advanced-plan-list">'+p.exercises.map(e=>'<div>'+label(e.name)+' <strong>'+e.target+' '+EXERCISES[e.name].unit+'</strong></div>').join('')+'</div>'+
      '<p>Rest: '+p.rest+' seconds</p><button type="button" class="primary-btn full" data-run-preset="'+i+'">Start '+p.name+'</button></article>').join('')+'</div>'+
      '<div class="advanced-actions"><button id="advanced-open-builder" class="secondary-btn" type="button">Create custom workout</button> '+
      '<button id="advanced-open-analytics" class="secondary-btn" type="button">Performance analytics</button> '+
      '<button id="advanced-open-recognition" class="secondary-btn" type="button">Exercise recognition (experimental)</button></div>'+
      '<div class="panel card-surface advanced-settings"><strong>Coaching preferences</strong>'+
      '<label><input id="advanced-voice" type="checkbox"> Voice guidance</label>'+
      '<label><input id="advanced-adaptive" type="checkbox"> Adaptive targets / rest</label>'+
      '<label><input id="advanced-calibrate" type="checkbox"> Starting-angle calibration</label>'+
      '<button id="advanced-save-settings" type="button" class="secondary-btn">Save preferences</button>'+
      '<p class="disclaimer">Experimental browser coaching, with locally saved preferences. Desktop models are not yet fully ported.</p></div>';
    home.insertBefore(container,section.parentNode===home?section:home.lastChild);
    // Extra exercise cards, preserving all existing three.
    for(const [code,ex] of Object.entries(EXERCISES).slice(3)){
      const button=document.createElement('button');button.type='button';button.className='exercise-card';button.dataset.exercise=code;
      button.innerHTML='<div class="exercise-number">DIMITRI V2 / ADDITIONAL</div><div class="exercise-icon">◎</div>'+
        '<h3>'+ex.label+'</h3><p>'+ex.view+' view · '+ex.unit+' · geometric cues</p><span>Start '+ex.label+' ↗</span>';
      section.appendChild(button);button.addEventListener('click',()=>hooks.selectExercise(code));
    }
    for(const [code,ex] of Object.entries(EXERCISES).slice(3)){
      const select=byId('exercise-select');const option=document.createElement('option');option.value=code;option.textContent=ex.label;select.appendChild(option);
    }
    const builderRoot=document.createElement('section');builderRoot.id='advanced-builder';builderRoot.className='hidden';home.appendChild(builderRoot);
    const analyticsRoot=document.createElement('section');analyticsRoot.id='advanced-analytics';analyticsRoot.className='hidden';home.appendChild(analyticsRoot);
    const lastResult=document.createElement('section');lastResult.id='advanced-program-results';lastResult.className='hidden';home.appendChild(lastResult);
    const live=byId('view-workout');
    const info=document.createElement('div');info.id='advanced-program-live';info.className='panel card-surface hidden';live.insertBefore(info,live.querySelector('.workout-grid'));
    const rest=document.createElement('div');rest.id='advanced-rest';rest.className='panel card-surface hidden';live.insertBefore(rest,live.querySelector('.workout-grid'));
    const extras=document.createElement('div');extras.className='advanced-actions';extras.innerHTML=
      '<button type="button" id="advanced-pause" class="secondary-btn">Pause / Resume</button> '+
      '<button type="button" id="advanced-compare" class="secondary-btn">Compare form</button> '+
      '<button type="button" id="advanced-replay" class="secondary-btn">Replay landmarks</button> '+
      '<button type="button" id="advanced-analytics-live" class="secondary-btn">Analytics</button> '+
      '<button type="button" id="advanced-end-program" class="secondary-btn hidden">Exit program</button>';
    live.appendChild(extras);
    const compare=document.createElement('div');compare.id='advanced-comparison';compare.className='panel card-surface hidden';
    compare.innerHTML='<strong>REFERENCE SKELETON — schematic only</strong><canvas id="advanced-reference" width="340" height="210"></canvas>';
    live.appendChild(compare);
    const replayRoot=document.createElement('section');replayRoot.id='advanced-replay';replayRoot.className='hidden';live.appendChild(replayRoot);
    container.querySelectorAll('[data-run-preset]').forEach(b=>b.onclick=()=>startPlan(PRESETS[Number(b.dataset.runPreset)]));
    byId('advanced-open-builder').onclick=builder;
    byId('advanced-open-analytics').onclick=analytics;
    byId('advanced-open-recognition').onclick=()=>hooks.startRecognition?.();
    byId('advanced-save-settings').onclick=savePrefs;
    byId('advanced-pause').onclick=()=>hooks.togglePause?.();
    byId('advanced-compare').onclick=comparison;
    byId('advanced-replay').onclick=replay;
    byId('advanced-analytics-live').onclick=()=>{hooks.showView('home');analytics();};
    byId('advanced-end-program').onclick=()=>{cancelPlan();hooks.toast?.('Program ended.');};
    loadPrefs();
  }
  return {render,startPlan,onCompleted,onFrame,onRep,onStop,cancelPlan,cancelRest,loadPrefs,syncAccount,
    setHistory,analytics,replay,comparison,getState:()=>state};
}
