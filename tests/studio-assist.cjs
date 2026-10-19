const assert=require('node:assert/strict');
const {loadTs}=require('../scripts/test-studio.cjs');
class StudioError extends Error{constructor(message,status=400){super(message);this.status=status;}}

(async()=>{
  const {EMPTY_STUDIO}=loadTs('types/studio.ts');
  let state={...structuredClone(EMPTY_STUDIO),revision:4,title:'The village archive',premise:'An expanded premise.',roughIdea:'Hina returns to Hunza to reopen her village school.',
    operation:{id:'another-job',startedAt:new Date().toISOString()},characters:[{id:'hina',name:'Hina',appearance:'Black hair and brown eyes.',locked:true}],
    scenes:[{id:'classroom',title:'The classroom',description:'Hina opens the archive.',visualAction:'Hina opens the archive.',characterIds:['hina'],dialogues:[{id:'line',character:'Hina',text:'These are our stories.'}],takes:[]}]};
  let owner='owner', saves=0, prompt='';
  const ai=loadTs('lib/film/ai.ts',{'@/lib/studio/store':{StudioError},'@/lib/studio/ai':{askModel:async text=>{prompt=text;state={...state,revision:5,title:'Saved while thinking'};return {reply:'For this classroom, try a slow push in.',choices:[{label:'The archive reveal',message:'Slow push in as Hina opens the village archive.'}]};}}});
  const route=loadTs('app/api/studio/[id]/route.ts',{
    '@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:owner?{id:owner}:null}})}})},
    '@/lib/prisma':{prisma:{}},'@/lib/studio/store':{StudioError,loadStudio:async(user,id)=>{if(user!=='owner'||id!=='project')throw new StudioError('Project not found.',404);return {project:{id,userId:user},state:structuredClone(state)};},saveStudio:async()=>{saves++;throw new Error('A proposal must never save an old snapshot');}},
    '@/lib/film/ai':ai,
  });
  const context={params:Promise.resolve({id:'project'})};
  const post=input=>route.POST({json:async()=>input},context);
  const response=await post({action:'assist',field:'camera',sceneId:'classroom',characterId:'hina',context:{premise:'Hina returns to Hunza to reopen her village school.',visualStyle:'Natural mountain daylight'}});
  assert.equal(response.status,200);const body=await response.json();assert.equal(body.state.revision,5);assert.equal(body.state.title,'Saved while thinking');assert.equal(saves,0);
  assert.match(prompt,/Hina returns to Hunza/);assert.match(prompt,/Natural mountain daylight/);assert.match(prompt,/The classroom/);assert.match(prompt,/Anchor EVERY suggestion/);assert.match(prompt,/"id":"hina"/);
  assert.equal((await post({action:'assist',field:'camera',sceneId:'other'})).status,404);
  assert.equal((await post({action:'assist',field:'dialogue',sceneId:'classroom',dialogueId:'other'})).status,404);
  assert.equal((await post({action:'assist',field:'wardrobe',sceneId:'classroom',characterId:'other'})).status,404);
  owner='intruder';assert.equal((await post({action:'assist',field:'title'})).status,404);owner=null;assert.equal((await post({action:'assist',field:'title'})).status,401);
  const requests=[], bodies=[];
  const model=loadTs('lib/studio/ai.ts',{'@/lib/studio/store':{StudioError},'@/lib/env':{getEnvValue:names=>({GEMINI_API_KEY:'test-gemini',GROQ_API_KEY:'test-groq'})[names[0]]||''},fetch:async (url,init)=>{requests.push(url);bodies.push(init&&init.body);if(url.includes('googleapis'))throw new TypeError('Network unavailable');return new Response(JSON.stringify({choices:[{message:{content:'{"reply":"Use your mountain setting."}'}}]}),{status:200,headers:{'content-type':'application/json'}});}});
  assert.equal((await model.askModel('Help with Hina’s story')).reply,'Use your mountain setting.');assert.equal(requests.length,2);
  assert.equal(JSON.parse(bodies[1]).model,'llama-3.3-70b-versatile','Text help falls back to the text model');
  // Visual checks fall back to Groq's VISION model with the images attached,
  // so a Gemini outage or quota limit does not strand a continuity check.
  requests.length=0;bodies.length=0;
  assert.equal((await model.askModel('Analyse reference',{mimeType:'image/png',data:'test'})).reply,'Use your mountain setting.');
  assert.equal(requests.length,2);assert.match(requests[1],/api\.groq\.com/);
  const visual=JSON.parse(bodies[1]);
  assert.equal(visual.model,'meta-llama/llama-4-scout-17b-16e-instruct','Image analysis never goes to the text-only model');
  assert.deepEqual(visual.messages[0].content,[{type:'text',text:'Analyse reference'},{type:'image_url',image_url:{url:'data:image/png;base64,test'}}],'Every image reaches the fallback');
  // Rate limits say so plainly, with the provider's own retry time.
  const limited=(gemini,groq,keys={GEMINI_API_KEY:'g',GROQ_API_KEY:'q'})=>loadTs('lib/studio/ai.ts',{'@/lib/studio/store':{StudioError},'@/lib/env':{getEnvValue:names=>keys[names[0]]||''},
    fetch:async url=>url.includes('googleapis')?gemini():groq()});
  const geminiLimited=(delay)=>new Response(JSON.stringify({error:{code:429,details:delay?[{'@type':'type.googleapis.com/google.rpc.RetryInfo',retryDelay:delay}]:[]}}),{status:429,headers:{'content-type':'application/json'}});
  const groqLimited=(after)=>new Response('{}',{status:429,headers:after?{'retry-after':String(after)}:{}});
  const rejectsWith=async(model,pattern)=>{let caught;await model.askModel('Help').catch(error=>{caught=error;});assert.ok(caught,'A rate limit must reject');assert.equal(caught.status,429);assert.match(caught.message,/rate-limited/);assert.match(caught.message,/Nothing was changed/);assert.match(caught.message,pattern);};
  await rejectsWith(limited(()=>geminiLimited('37s'),()=>groqLimited(12)),/about 12 seconds/);
  await rejectsWith(limited(()=>geminiLimited('8s'),()=>groqLimited(40)),/about 8 seconds/);
  await rejectsWith(limited(()=>geminiLimited('300s'),()=>groqLimited()),/about 5 minutes/);
  await rejectsWith(limited(()=>geminiLimited(),()=>groqLimited()),/Try again in a minute/);
  await rejectsWith(limited(()=>geminiLimited('86000s'),()=>groqLimited(),{GEMINI_API_KEY:'g'}),/later today/);
  // Another Groq failure is not reported as a rate limit.
  let other;await limited(()=>geminiLimited('8s'),()=>new Response('{}',{status:500})).askModel('Help').catch(error=>{other=error;});
  assert.equal(other.status,502);assert.match(other.message,/backup AI provider is unavailable \(500\)/);
  console.log('PASS: contextual field assistance, no snapshot writes during concurrent saves, help during media work, scoped ownership/IDs, text fallback on network failure, visual checks falling back to a vision model with every image, and plain rate-limit messages with the provider's retry time. No provider calls were made.');
})().catch(error=>{console.error(error);process.exitCode=1;});
