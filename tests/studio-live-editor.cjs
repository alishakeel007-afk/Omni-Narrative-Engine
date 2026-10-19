// Real authenticated app/API editing over existing generated media. The only
// fixture write seeds a separate editor-only QA workspace; original films and
// takes remain untouched. This does not validate generation/character drift.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {chromium,expect:baseExpect}=require('@playwright/test');
const expect=baseExpect.configure({timeout:60000});
const {loadTs}=require('../scripts/test-studio.cjs');
require('dotenv').config({path:'.env.local',quiet:true});
const base=process.env.STUDIO_TEST_URL||'http://localhost:3000';
const artifacts=path.resolve('.run-screenshots');

(async()=>{
  const context=await chromium.launchPersistentContext(path.join(artifacts,'qa-browser'),{headless:true,channel:'chrome',viewport:{width:1440,height:1000}});
  let prisma;
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.setDefaultTimeout(60000);
  const api=async(endpoint,body)=>{
    const response=body?await context.request.post(base+endpoint,{data:body,timeout:90000}):await context.request.get(base+endpoint,{timeout:90000});
    const value=await response.json();
    if(!response.ok()) throw Error(value.error||`HTTP ${response.status()}`);
    return value;
  };
  try {
    const {projects}=await api('/api/studio');
    let source;
    for(const project of projects.filter(item=>/LTX.*validation/i.test(item.title))){
      const candidate=(await api('/api/studio/'+project.id)).state;
      if(candidate.scenes.flatMap(scene=>scene.takes).filter(take=>take.kind==='video'&&take.status==='complete'&&take.url).length>=2){source={...project,state:candidate};break;}
    }
    if(!source) throw Error('No existing two-clip validation film is available; no new generation will be submitted.');
    const record=path.join(artifacts,'editor-project.json');
    const id=fs.existsSync(record)?JSON.parse(fs.readFileSync(record,'utf8')).id:(await api('/api/studio',{})).id;
    await api('/api/studio/'+id); // Authenticated ownership check before fixture write.
    fs.writeFileSync(record,JSON.stringify({id,sourceId:source.id}));
    const {normalizeStudioState}=loadTs('types/studio.ts');
    const {assembleClips}=loadTs('lib/film/generate.ts');
    const videos=source.state.scenes.flatMap(scene=>scene.takes).filter(take=>take.kind==='video'&&take.status==='complete'&&take.url).slice(0,2);
    const fixture=normalizeStudioState({title:'Editor validation — reused media',premise:'Editor-only verification of existing videos. No new generation or character-consistency claim.',world:'',assist:'custom',language:'en',step:'edit',
      characters:[],scenes:videos.map((take,index)=>{
        // A legacy, cast-free editor source: no invented identity approval or
        // claim that it was generated from this editor-only description.
        const source={...take,duration:take.duration||4.041667,identity:undefined,continuity:undefined,sourceRequirements:undefined,stale:false};
        return {id:randomUUID(),title:`Saved clip ${index+1}`,description:'Existing generated clip reused to verify editing.',characterIds:[],dialogues:[],takes:[source],selectedVideoId:source.id};
      }),exports:source.state.exports||[],messages:[],timeline:[],edits:{}});
    fixture.clips=assembleClips(fixture);
    fixture.timeline=fixture.scenes.map(scene=>scene.id);
    ({prisma}=loadTs('lib/prisma.ts'));
    const owner=await prisma.filmWorkspace.findUnique({where:{id:source.id},select:{userId:true}});
    const changed=await prisma.filmWorkspace.updateMany({where:{id,userId:owner.userId},data:{state:JSON.parse(JSON.stringify(fixture)),title:fixture.title,revision:0}});
    assert.equal(changed.count,1,'Fixture writes must stay in the signed-in owner’s QA workspace');
    const state=async()=> (await api('/api/studio/'+id)).state;
    await page.goto(base+'/story/'+id,{waitUntil:'domcontentloaded',timeout:90000});
    await page.evaluate(id=>localStorage.setItem(`story:${id}:edit`,'preview'),id);
    await page.reload();
    const jump=part=>page.getByRole('combobox',{name:'Jump to a small step',exact:true}).selectOption(part);
    await expect(page.getByRole('heading',{name:'Edit & Export',exact:true})).toBeVisible();
    const preview=page.locator('video').first();
    await expect.poll(()=>preview.evaluate(video=>video.readyState)).toBeGreaterThanOrEqual(2);
    assert.ok((await preview.boundingBox()).height>150,'The size container must not collapse the video preview');
    await page.getByRole('button',{name:'Play',exact:true}).click();
    await expect.poll(()=>preview.evaluate(video=>video.currentTime)).toBeGreaterThan(.25);
    await page.getByRole('button',{name:'Pause',exact:true}).click();
    await jump('arrange');
    await page.getByLabel('Story position').evaluate(input=>{
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'1.2');
      input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));
    });
    await page.getByRole('button',{name:'Split here',exact:true}).first().click();
    await expect.poll(async()=> (await state()).clips.length).toBe(3);
    const original=(await state()).clips[0].sourceOut;
    const handle=await page.getByRole('button',{name:'Trim the end of clip 1',exact:true}).boundingBox();
    await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);
    await page.mouse.down();await page.mouse.move(handle.x+handle.width/2-16,handle.y+handle.height/2,{steps:6});await page.mouse.up();
    await expect.poll(async()=> (await state()).clips[0].sourceOut).toBeLessThan(original-.15);
    const firstId=(await state()).clips[0].id;
    await page.getByRole('button',{name:'Move later',exact:true}).first().click();
    await expect.poll(async()=> (await state()).clips[1].id).toBe(firstId);
    await jump('text');
    await page.getByRole('button',{name:/^Clip 1 ·/}).click();
    await page.getByRole('button',{name:'Add text',exact:true}).first().click();
    const text=page.getByLabel('Overlay 1 text',{exact:true});
    await text.fill('Rehearsal: it is 100% editable');
    await text.pressSequentially(' — saved',{delay:20});
    await text.blur();
    await expect.poll(async()=> (await state()).clips[0].texts?.[0]?.text).toBe('Rehearsal: it is 100% editable — saved');
    await jump('arrange');
    await page.getByRole('button',{name:'Delete this clip',exact:true}).last().click();
    await expect.poll(async()=> (await state()).clips.length).toBe(2);
    await page.getByRole('button',{name:'Undo',exact:true}).click();
    await expect.poll(async()=> (await state()).clips.length).toBe(3);
    await page.reload();
    await jump('text');
    await expect(text).toHaveValue('Rehearsal: it is 100% editable — saved');
    await jump('export');
    await expect(page.getByRole('button',{name:'Export the story',exact:true})).toBeEnabled();
    // Do not click Export: the user explicitly chose no new paid generation.
    await page.screenshot({path:path.join(artifacts,'live-editor-desktop.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844});
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:path.join(artifacts,'live-editor-mobile.png'),fullPage:true});
    assert.deepEqual(errors,[]);
    console.log('PASS: real authenticated editor/API, existing video playback, pointer trim, split, reorder, editable overlay typing/save, delete/undo and refresh persistence, desktop/mobile layout. No render or generation job submitted.');
  } catch(error){await page.screenshot({path:path.join(artifacts,'live-editor-failure.png'),fullPage:true}).catch(()=>{});throw error;}
  finally {if(prisma)await prisma.$disconnect();await context.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
