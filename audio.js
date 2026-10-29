/* Short effects only. Context readiness is not proof of audible speaker output. */
(function(root){
'use strict';
function createAudio(options={}){
 const make=options.createContext||(()=>new (root.AudioContext||root.webkitAudioContext)());
 const hidden=options.hidden||(()=>!!root.document?.hidden), notify=options.onRecovery||(()=>{});
 let context=null,pending=null,attempt=0,epoch=0,used=false;const nodes=new Set();
 const report=()=>{try{notify(used&&(!context||context.state!=='running'));}catch{}};
 function cancel(){epoch++;for(const n of [...nodes]){try{n.osc.stop();}catch{}n.clean();}}
 function prepare(){
  used=true;if(hidden()){report();return Promise.resolve(false);}
  try{
   if(!context||context.state==='closed'){
    cancel();context=make();const own=context;
    context.onstatechange=()=>{if(context!==own)return;if(context.state!=='running')cancel();report();};
   }
   if(context.state==='running'){report();return Promise.resolve(true);}
   if(pending)return pending;
   const own=context,id=++attempt;
   // resume is invoked synchronously in the user's event, before any await.
   const resumed=own.resume();
   pending=new Promise(resolve=>{
    let settled=false;const finish=ok=>{if(settled)return;settled=true;clearTimeout(timer);if(id===attempt){pending=null;report();}resolve(ok&&id===attempt&&context===own&&own.state==='running'&&!hidden());};
    const timer=setTimeout(()=>finish(false),700);
    Promise.resolve(resumed).then(()=>finish(true),()=>finish(false));
   });
   report();return pending;
  }catch{pending=null;report();return Promise.resolve(false);}
 }
 function tone(freq,duration=.05,type='triangle',volume=.12,offset=0){
  if(hidden()||!context||context.state!=='running'){report();return false;}
  let osc,gain,record;try{
   osc=context.createOscillator();gain=context.createGain();
   const at=context.currentTime+offset;osc.type=type;osc.frequency.setValueAtTime(freq,at);
   gain.gain.setValueAtTime(.0001,at);gain.gain.linearRampToValueAtTime(volume,at+.005);gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
   record={osc,clean(){nodes.delete(record);try{osc.disconnect();}catch{}try{gain.disconnect();}catch{}}};nodes.add(record);osc.onended=record.clean;
   osc.connect(gain);gain.connect(context.destination);osc.start(at);osc.stop(at+duration);return true;
  }catch{if(record)record.clean();else{try{osc?.disconnect();gain?.disconnect();}catch{}}return false;}
 }
 function gestureTone(...args){const ready=prepare(),generation=epoch,requested=Date.now();return ready.then(ok=>{if(ok&&generation===epoch&&Date.now()-requested<180)tone(...args);});}
 function visibility(){if(hidden()){cancel();attempt++;pending=null;}report();}
 return {prepare,tone,gestureTone,cancel,visibility};
}
root.BingoAudio={create:createAudio};if(typeof module!=='undefined')module.exports=root.BingoAudio;
})(typeof window==='undefined'?globalThis:window);
