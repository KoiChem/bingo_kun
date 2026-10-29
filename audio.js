/* Short effects only. Clock checks prevent stale effects; they do not prove speaker audibility. */
(function(root){
'use strict';
function createAudio(options={}){
 const make=options.createContext||(()=>new (root.AudioContext||root.webkitAudioContext)({latencyHint:'interactive'}));
 const hidden=options.hidden||(()=>!!root.document?.hidden), notify=options.onRecovery||(()=>{});
 const now=options.now||(()=>root.performance?.now()??Date.now());
 const MAX_DELAY=.12;
 let context=null,pending=null,attempt=0,epoch=0,used=false,ready=false,badClock=false,clock=null,watch=null;
 const nodes=new Set();
 const report=()=>{try{notify(used&&(badClock||!context||context.state!=='running'||(!ready&&!pending)));}catch{}};
 function cancel(){epoch++;clearTimeout(watch);watch=null;for(const n of [...nodes]){try{n.osc.stop();}catch{}n.clean();}}
 function invalidate(){ready=false;clock=null;badClock=true;cancel();report();}
 function timingGood(){
  if(!ready||!clock||!context||context.state!=='running'||hidden())return false;
  // AudioContext.state can be running even while the iOS audio clock is frozen.
  const drift=(now()-clock.wall)/1000-(context.currentTime-clock.audio);
  return Math.abs(drift)<=MAX_DELAY;
 }
 function monitor(){
  if(watch!==null||!nodes.size)return;
  watch=setTimeout(()=>{watch=null;if(!timingGood())invalidate();else monitor();},30);
 }
 function prepare(){
  used=true;if(hidden()){report();return Promise.resolve(false);}
  try{
   // Replace a clock proven stuck only on a new user gesture, never from a timer.
   if(badClock&&context){try{Promise.resolve(context.close()).catch(()=>{});}catch{}context=null;}
   if(!context||context.state==='closed'){
    cancel();ready=false;clock=null;badClock=false;context=make();const own=context;
    context.onstatechange=()=>{if(context!==own)return;if(context.state!=='running'){ready=false;clock=null;cancel();}report();};
   }
   if(timingGood()){report();return Promise.resolve(true);}
   if(pending)return pending;
   ready=false;const own=context,id=++attempt;
   // Invoke resume in the user's event, before awaiting its result or clock progress.
   const resumed=own.resume();
   pending=new Promise(resolve=>{
    let settled=false,probe=null,sample=null;
    const finish=(ok,stalled=false)=>{if(settled)return;settled=true;clearTimeout(expiry);clearTimeout(probe);if(id===attempt){pending=null;if(!ok){ready=false;clock=null;badClock=stalled;cancel();}report();}resolve(ok&&id===attempt&&context===own&&own.state==='running'&&!hidden());};
    const poll=()=>{
     if(id!==attempt||context!==own||hidden()||own.state!=='running'){finish(false);return;}
     const current={wall:now(),audio:own.currentTime};
     if(sample){const wall=(current.wall-sample.wall)/1000,advanced=current.audio-sample.audio;
      if(wall>=.03&&advanced>=.015&&Math.abs(wall-advanced)<MAX_DELAY){
       clock=current;ready=true;badClock=false;finish(true);return;
      }
     }else sample=current;
     probe=setTimeout(poll,20);
    };
    const expiry=setTimeout(()=>finish(false,own.state==='running'),700);
    Promise.resolve(resumed).then(poll,()=>finish(false));
   });
   report();return pending;
  }catch{pending=null;invalidate();return Promise.resolve(false);}
 }
 function tone(freq,duration=.05,type='triangle',volume=.12,offset=0){
  if(!timingGood()){if(ready)invalidate();else report();return false;}
  let osc,gain,record;try{
   osc=context.createOscillator();gain=context.createGain();
   const at=context.currentTime+offset;osc.type=type;osc.frequency.setValueAtTime(freq,at);
   gain.gain.setValueAtTime(.0001,at);gain.gain.linearRampToValueAtTime(volume,at+.005);gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
   record={osc,clean(){nodes.delete(record);try{osc.disconnect();}catch{}try{gain.disconnect();}catch{}if(!nodes.size){clearTimeout(watch);watch=null;}}};nodes.add(record);osc.onended=record.clean;
   osc.connect(gain);gain.connect(context.destination);osc.start(at);osc.stop(at+duration);monitor();return true;
  }catch{if(record)record.clean();else{try{osc?.disconnect();gain?.disconnect();}catch{}}return false;}
 }
 function gestureTone(...args){const prepared=prepare(),generation=epoch,requested=now();return prepared.then(ok=>{if(ok&&generation===epoch&&now()-requested<180)tone(...args);});}
 function visibility(){if(hidden()){cancel();attempt++;pending=null;ready=false;clock=null;}report();}
 return {prepare,tone,gestureTone,cancel,visibility};
}
root.BingoAudio={create:createAudio};if(typeof module!=='undefined')module.exports=root.BingoAudio;
})(typeof window==='undefined'?globalThis:window);
