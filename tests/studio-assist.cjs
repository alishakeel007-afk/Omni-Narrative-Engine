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
  const requests=[];
  const model=loadTs('lib/studio/ai.ts',{'@/lib/studio/store':{StudioError},'@/lib/env':{getEnvValue:names=>({GEMINI_API_KEY:'test-gemini',GROQ_API_KEY:'test-groq'})[names[0]]||''},fetch:async url=>{requests.push(url);if(url.includes('googleapis'))throw new TypeError('Network unavailable');return new Response(JSON.stringify({choices:[{message:{content:'{"reply":"Use your mountain setting."}'}}]}),{status:200,headers:{'content-type':'application/json'}});}});
  assert.equal((await model.askModel('Help with Hina’s story')).reply,'Use your mountain setting.');assert.equal(requests.length,2);
  requests.length=0;await assert.rejects(()=>model.askModel('Analyse reference',{mimeType:'image/png',data:'test'}),/could not reach its provider/);assert.equal(requests.length,1,'Image analysis must never fall back to a text-only model');
  console.log('PASS: contextual field assistance, no snapshot writes during concurrent saves, help during media work, scoped ownership/IDs, and text fallback on network failure. No provider calls were made.');
})().catch(error=>{console.error(error);process.exitCode=1;});
