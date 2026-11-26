import {assessFrame,activityCue,cueForVoice} from './remote-coach.js';

export function createRemoteCoach({getExercise=()=> 'squat'}={}){
  const card=document.getElementById('view-workout');
  const stage=card?.querySelector('.camera-stage');
  if(!stage)return null;
  const overlay=document.createElement('div');
  overlay.id='distance-coach';
  overlay.className='distance-coach hidden';
  overlay.setAttribute('role','status');
  overlay.setAttribute('aria-live','off');
  overlay.innerHTML='<span class="distance-coach-tag">LIVE GUIDANCE</span><strong id="distance-coach-title">GET READY</strong><span id="distance-coach-detail">Make sure your body fits in the frame.</span>';
  stage.appendChild(overlay);

  const panel=document.createElement('div');
  panel.className='distance-coach-controls';
  panel.innerHTML='<label class="distance-coach-toggle"><input id="distance-coach-voice" type="checkbox"> <span>🔊 Spoken workout instructions</span></label>'+
    '<button id="distance-coach-fullscreen" class="secondary-btn" type="button" aria-label="Maximize workout view">⤢ Maximize</button>'+
    '<span class="distance-coach-help">Voice works best when your device is not muted. Start the camera to hear coaching.</span>';
  stage.closest('.camera-card')?.appendChild(panel);

  const voiceToggle=document.getElementById('distance-coach-voice');
  const fullscreen=document.getElementById('distance-coach-fullscreen');
  let enabled=false,lastSpoken='',lastSpokenAt=0,started=false,previousKind='',latestCue=null,lastCount=0;
  let utterance=null;
  try{
    const x=localStorage.getItem('motionlab_spoken_instructions');
    if(x!=null)enabled=x==='true';
  }catch{}
  voiceToggle.checked=enabled;
  function setEnabled(value){
    enabled=Boolean(value);
    voiceToggle.checked=enabled;
    const chooser=document.getElementById('choice-voice');
    if(chooser)chooser.checked=enabled;
    try{localStorage.setItem('motionlab_spoken_instructions',String(enabled));}catch{}
    if(!enabled&&'speechSynthesis' in window)window.speechSynthesis.cancel();
  }
  voiceToggle.onchange=()=>{
    setEnabled(voiceToggle.checked);
    if(enabled)speak('Spoken instructions are on.',true);
  };
  const fullscreenRoot=stage.closest('.camera-card');
  function syncFullscreenButton(){
    const expanded=document.fullscreenElement===fullscreenRoot;
    fullscreen.textContent=expanded?'⤡ Minimize':'⤢ Maximize';
    fullscreen.setAttribute('aria-label',expanded?'Minimize workout view':'Maximize workout view');
    fullscreen.setAttribute('aria-pressed',String(expanded));
    fullscreen.title=expanded?'Exit fullscreen (Esc)':'Enter fullscreen workout view';
  }
  fullscreen.onclick=()=>{
    if(!fullscreenRoot)return;
    if(document.fullscreenElement===fullscreenRoot){
      void document.exitFullscreen?.().catch(()=>{});
    }else if(!document.fullscreenElement && fullscreenRoot.requestFullscreen){
      void fullscreenRoot.requestFullscreen().catch(()=>{});
    }
  };
  // Also update after pressing Escape or leaving fullscreen without clicking the button.
  document.addEventListener('fullscreenchange',syncFullscreenButton);
  syncFullscreenButton();
  function speak(text,urgent=false){
    if(!enabled||!started||!('speechSynthesis' in window)||!text)return;
    const now=Date.now();
    if(!urgent&&(text===lastSpoken||now-lastSpokenAt<5200))return;
    if(urgent&&text===lastSpoken&&now-lastSpokenAt<950)return;
    if(window.speechSynthesis.speaking)window.speechSynthesis.cancel();
    utterance=new SpeechSynthesisUtterance(text);
    // Specifying en-US alone does not choose a voice. Prefer an explicitly
    // American English voice instead of the browser's system-default accent.
    const voices=window.speechSynthesis.getVoices?.()||[];
    const american=voices.filter(v=>/^en[-_]US$/i.test(v.lang));
    const british=voices.filter(v=>/^en[-_]GB$/i.test(v.lang));
    const known=/samantha|alex|google us english|aria|jenny|davis|allison|ava|english \(united states\)/i;
    const chosen=american.find(v=>known.test(v.name)) || american[0] ||
      british.find(v=>/daniel|serena|google uk english|sonia|ryan/i.test(v.name)) || british[0] || null;
    if(chosen)utterance.voice=chosen;
    utterance.lang=chosen?.lang || 'en-US';
    utterance.rate=.94;utterance.volume=1;
    window.speechSynthesis.speak(utterance);
    lastSpoken=text;lastSpokenAt=now;
  }
  function markStarted(exercise){
    started=true;previousKind='';lastSpoken='';lastCount=0;
    overlay.classList.remove('hidden');
    update({phase:'position',frame:assessFrame(null,exercise),ready:false},true);
    speak('Camera starting. Step back until your whole body is visible.',true);
  }
  function update(input={},force=false){
    const exercise=input.exercise||getExercise();
    const cue=activityCue({...input,exercise});
    latestCue=cue;
    overlay.classList.remove('hidden');
    overlay.dataset.kind=cue.kind;
    document.getElementById('distance-coach-title').textContent=cue.title;
    document.getElementById('distance-coach-detail').textContent=cue.detail;
    const urgent=force||previousKind!==cue.kind||cue.kind==='countdown';
    if(cue.kind==='countdown'){
      if(previousKind!=='countdown')speak('Get ready. Three, two, one. Go!',true);
    }else if(cue.kind!=='active'){
      if(urgent)speak(cueForVoice(cue),true);
    }else if(previousKind!=='active')speak('Start your '+(exercise==='plank'?'plank hold':exercise==='squat'?'squats':'push-ups')+'.',true);
    previousKind=cue.kind;
    return cue;
  }
  function onCount(counter,target){
    if(!started||!counter)return;
    const n=counter.exercise==='plank'?Math.floor(Number(counter.validSeconds||0)):Math.floor(Number(counter.reps||0));
    if(n<=lastCount)return;
    lastCount=n;
    if(counter.exercise==='plank'){
      if(n>0&&(n%5===0||n===Math.floor(target)))speak(n+' seconds',true);
    }else speak(String(n),true);
  }
  function announce(text){
    if(!enabled||!('speechSynthesis' in window)||!text)return;
    // Rest and completion prompts can be spoken after camera tracking stops.
    started=true;speak(text,true);started=false;
  }
  function stop(){started=false;overlay.classList.add('hidden');previousKind='';lastCount=0;
    if('speechSynthesis' in window)window.speechSynthesis.cancel();}
  return {update,onCount,markStarted,announce,stop,assessFrame,enabled:()=>enabled,setEnabled};
}
