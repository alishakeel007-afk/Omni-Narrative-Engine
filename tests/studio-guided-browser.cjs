// Uses the real application and a manually signed-in browser profile.
// --live-ai makes at most three text-help calls; never generates images/video or exports.
const fs=require('node:fs');
const path=require('node:path');
const {chromium,expect:baseExpect}=require('@playwright/test');
const expect=baseExpect.configure({timeout:90000});
const base=process.env.STUDIO_TEST_URL||'http://localhost:3000';
const artifacts=path.resolve('.run-screenshots');
const authenticated=process.argv.includes('--authenticated');
const liveAI=process.argv.includes('--live-ai');

(async()=>{
  fs.mkdirSync(artifacts,{recursive:true});
  const browser=authenticated?null:await chromium.launch({channel:'chrome',headless:true});
  const context=authenticated?await chromium.launchPersistentContext(path.join(artifacts,'qa-browser'),{channel:'chrome',headless:false,viewport:{width:1440,height:1000}}):await browser.newContext({viewport:{width:1440,height:1000}});
  const page=context.pages()[0]||await context.newPage();
  page.setDefaultTimeout(90000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const paid=[];
  let temporaryStory=null;
  await page.route('**/api/studio/**',async route=>{
    const request=route.request();
    if(request.method()==='POST'){
      let body;try{body=request.postDataJSON();}catch{}
      if(['generate','generatePortrait','generateChatImage','script','assemble'].includes(body?.action)||(body?.action==='submit'&&request.url().includes('/jobs'))||/\/(export|render)$/.test(new URL(request.url()).pathname)){
        paid.push({path:new URL(request.url()).pathname,action:body?.action});await route.abort();throw new Error('Generation/export was not authorized by this browser test');
      }
    }
    await route.continue();
  });
  async function api(id,body){const response=await page.request.post(`${base}/api/studio/${id}`,{data:body});const data=await response.json();assertOK(response,data);return data.state;}
  function assertOK(response,data){if(!response.ok())throw new Error(`${response.status()}: ${data.error||'API failed'}`);}
  async function jump(id,scope=page.locator('.decision-flow').first()){await scope.getByRole('combobox',{name:'Jump to a small step',exact:true}).first().selectOption(id);}
  try{
    if(!authenticated){
      await page.goto(base,{waitUntil:'domcontentloaded',timeout:90000});
      await page.locator('.public-hero').getByRole('link',{name:'Start your story',exact:true}).click();
      const trial=page.locator('#trial-conversation');
      await expect(trial.getByRole('heading',{name:'What is your story about?',exact:true})).toBeVisible();
      await expect(trial.locator('#guest-style')).toHaveCount(0);
      await trial.getByLabel('What is your story about?',{exact:true}).fill('Hina returns to Hunza to reopen her village school and discovers her grandmother’s archive.');
      await expect(trial.getByRole('button',{name:'The last tape',exact:true})).toHaveCount(0);
      await trial.getByRole('button',{name:'Continue',exact:true}).click();
      await expect(trial.getByRole('heading',{name:'Find your story’s look',exact:true})).toBeVisible();
      await expect(trial.locator('#guest-idea')).toHaveCount(0);
      await trial.getByLabel('Visual style',{exact:true}).fill('Natural mountain daylight and grounded colours');
      await trial.getByRole('button',{name:'Continue',exact:true}).click();
      await expect(trial.getByRole('button',{name:'20s · Coming soon',exact:true})).toBeDisabled();
      await trial.getByRole('button',{name:/Urdu/}).click();
      await expect(trial.locator('.guest-note').filter({hasText:/Urdu/})).toBeVisible();
      await page.setViewportSize({width:390,height:844});
      await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      await page.screenshot({path:path.join(artifacts,'guided-home-mobile.png'),fullPage:true});
      await page.goto(base+'/story/test');await expect(page).toHaveURL(/\/auth\?next=/);
      console.log('PASS: public story entry, one decision per page, original-idea retention, no unrelated chips after typing, gated lengths, mobile layout and protected story routes.');
    }else{
      await page.goto(base+'/dashboard',{waitUntil:'domcontentloaded',timeout:90000});
      if(new URL(page.url()).pathname==='/auth'){
        console.log('AUTH_REQUIRED: sign in manually in the verification Chrome window.');
        await page.waitForURL(url=>url.pathname==='/dashboard',{timeout:1800000});
      }
      await expect(page.getByRole('heading',{name:'Your stories',exact:true})).toBeVisible();
      console.log('CHECK: dashboard and navigation');
      const nav=page.locator('header nav').first();
      for(const label of ['Stories','New story','How it works','Settings'])await expect(nav.getByRole('link',{name:label,exact:true})).toBeVisible();
      await nav.getByRole('link',{name:'How it works',exact:true}).click();
      await expect(page.getByRole('heading',{name:'One story. One decision at a time.',exact:true})).toBeVisible();
      const createdResponse=page.waitForResponse(response=>response.url()===base+'/api/studio'&&response.request().method()==='POST');
      await page.locator('header nav').first().getByRole('link',{name:'New story',exact:true}).click();
      const created=await createdResponse;const createdBody=await created.json();assertOK(created,createdBody);temporaryStory=createdBody.id;
      await expect(page).toHaveURL(new RegExp(`/story/${temporaryStory}$`));
      await expect(page.getByLabel('Story idea',{exact:true})).toBeVisible();
      await expect(page.getByRole('button',{name:'Continue',exact:true})).toBeDisabled();
      console.log('CHECK: New story creates and opens a blank story');
      const id=JSON.parse(fs.readFileSync(path.join(artifacts,'live-project.json'),'utf8')).id;
      const idea='Hina, a young teacher, returns to Hunza to reopen her village school and discovers her grandmother’s archive of local stories.';
      let state=await api(id,{action:'workflow',patch:{step:'setup',title:'The Hunza archive',premise:idea,visualStyle:'Natural mountain daylight',language:'en',assist:'guided'}});
      if(!state.characters.length)state=await api(id,{action:'createCharacter',name:'Hina',appearance:'A young teacher with black hair and warm brown eyes.'});
      if(!state.scenes.length)state=await api(id,{action:'sceneList',operation:'add'});
      const scene=state.scenes[0],character=state.characters[0];
      state=await api(id,{action:'scenePatch',sceneId:scene.id,patch:{title:'Opening the archive',visualAction:'Hina opens her grandmother’s archive in the village school. Mountain daylight enters through a window.',characterIds:[character.id]}});
      await page.goto(base+`/story/${id}`,{waitUntil:'domcontentloaded'});
      await page.evaluate(id=>{localStorage.setItem(`story:${id}:setup`,'idea');localStorage.setItem(`story:${id}:script`,'order');},id);
      await page.reload();
      await expect(page.getByLabel('Story idea',{exact:true})).toHaveValue(idea);
      console.log('CHECK: story setup and progress');
      await expect(page.getByLabel('Story title',{exact:true})).toHaveCount(0);
      await expect(page.getByRole('progressbar',{name:'Story completion',exact:true})).toBeVisible();
      const geometry=await page.locator('.story-progress-track').evaluate(el=>{const track=el.getBoundingClientRect();const nodes=[...document.querySelectorAll('.story-stage-number')].map(node=>{const r=node.getBoundingClientRect();return r.x+r.width/2;});return {start:track.x,end:track.right,nodes,position:getComputedStyle(el.closest('.story-progress')).position};});
      if(Math.abs(geometry.start-geometry.nodes[0])>2||Math.abs(geometry.end-geometry.nodes[3])>2)throw new Error('Progress track does not connect the numbered stages');
      if(geometry.position!=='static')throw new Error('Progress should scroll away');
      await page.getByRole('button',{name:'Continue',exact:true}).click();
      await expect(page.getByLabel('Story title',{exact:true})).toBeVisible();
      const answers=[];
      if(!liveAI){
        let requests=0;
        const reply='Keep Hina’s return to Hunza at the centre of the title.';
        await page.route(`${base}/api/studio/${id}`,async route=>{
          const request=route.request();const body=request.method()==='POST'?request.postDataJSON():null;
          if(body?.action!=='assist'){await route.fallback();return;}
          if(body.context?.premise!==idea||body.field!=='title')throw new Error('Omni did not send the current rough story and selected field');
          requests++;
          await route.fulfill({status:requests===1?429:200,contentType:'application/json',body:JSON.stringify(requests===1?{error:'Omni is busy. Please try again.'}:{assist:{reply,choices:[{label:'The Hunza archive',message:'Hina’s Hunza archive',description:'A title grounded in your village-school story.'}]}})});
        });
        await page.getByRole('button',{name:'Ask Omni · suggest a title',exact:true}).click();
        await expect(page.locator('.field-assist-body').getByRole('alert')).toContainText('Omni is busy');
        await page.locator('.field-assist-body').getByRole('button',{name:'Try again',exact:true}).click();
        await expect(page.locator('.field-assist-body')).toContainText(reply);
        await page.locator('.field-assist-body').getByRole('button',{name:/The Hunza archive/}).click();
        await expect(page.getByLabel('Story title',{exact:true})).toHaveValue('Hina’s Hunza archive');
        await page.unroute(`${base}/api/studio/${id}`);
        console.log('CHECK: AI button, inline failure, retry, story context and explicit acceptance (provider response simulated)');
      }
      if(liveAI){
        for(const [part,label] of [['title','suggest a title'],['tone','suggest tone']]){
          await jump(part);
          const responsePromise=page.waitForResponse(response=>response.url().endsWith(`/api/studio/${id}`)&&response.request().method()==='POST'&&response.request().postDataJSON()?.action==='assist',{timeout:180000});
          await page.getByRole('button',{name:`Ask Omni · ${label}`,exact:true}).click();
          const response=await responsePromise;const data=await response.json();assertOK(response,data);
          if(!data.assist?.choices?.length&&!data.assist?.value)throw new Error('Real Omni response returned no usable proposal');
          answers.push({field:part,reply:data.assist.reply,choices:data.assist.choices,value:data.assist.value});
          await expect(page.locator('.field-assist-body').filter({hasText:data.assist.reply})).toBeVisible();
          const option=data.assist.choices?.[0];
          if(option){await page.locator('.field-assist-body').getByRole('button',{name:option.label,exact:false}).click();await expect(page.getByLabel(part==='title'?'Story title':'Tone',{exact:true})).toHaveValue(option.message);}
        }
        fs.writeFileSync(path.join(artifacts,'guided-ai-answers.json'),JSON.stringify(answers,null,2));
      }
      await jump('look');await expect(page.getByLabel('Visual style',{exact:true})).toHaveValue('Natural mountain daylight');
      await page.screenshot({path:path.join(artifacts,'guided-setup-desktop.png'),fullPage:true});
      await page.getByRole('button',{name:/2\. Script & Characters/}).click();
      console.log('CHECK: character and scene pages');
      await jump(`character:${character.id}`);await expect(page.getByLabel('Character name',{exact:true})).toBeVisible();
      await expect(page.getByLabel('Visual action',{exact:true})).toHaveCount(0);
      await page.getByRole('button',{name:'2. Their story',exact:true}).click();
      await expect(page.getByRole('button',{name:'Ask Omni · suggest motivation',exact:true})).toBeVisible();
      await jump(`${scene.id}:action`);await expect(page.getByLabel('Visual action',{exact:true})).toBeVisible();
      await expect(page.getByLabel('Speaker',{exact:true})).toHaveCount(0);
      await jump(`${scene.id}:location`);await expect(page.getByRole('heading',{name:'Scene 1 · Where are we?',exact:true})).toBeVisible();
      await jump(`${scene.id}:camera`);await expect(page.getByRole('button',{name:'Ask Omni · camera',exact:true})).toBeVisible();
      await expect(page.getByRole('button',{name:'Back',exact:true})).toHaveCount(1);
      if(liveAI){
        const responsePromise=page.waitForResponse(response=>response.request().method()==='POST'&&response.url().endsWith(`/api/studio/${id}`)&&response.request().postDataJSON()?.action==='assist',{timeout:180000});
        await page.getByRole('button',{name:'Ask Omni · camera',exact:true}).click();const response=await responsePromise;const data=await response.json();assertOK(response,data);answers.push({field:'camera',...data.assist});
        await expect(page.locator('.field-assist-body').filter({hasText:data.assist.reply})).toBeVisible();fs.writeFileSync(path.join(artifacts,'guided-ai-answers.json'),JSON.stringify(answers,null,2));
      }
      await page.setViewportSize({width:390,height:700});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      await page.screenshot({path:path.join(artifacts,'guided-scene-mobile.png'),fullPage:true});
      await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
      const scroll=await page.locator('.story-progress').evaluate(el=>({top:el.getBoundingClientRect().top,scroll:window.scrollY}));
      if(scroll.scroll>100&&scroll.top>=56)throw new Error('Progress remained pinned while scrolling');
      await page.getByRole('button',{name:'Toggle navigation menu',exact:true}).click();
      await page.getByRole('link',{name:'View Profile',exact:true}).click();await expect(page).toHaveURL(/\/account\?tab=profile/);
      await page.setViewportSize({width:1440,height:1000});
      console.log('CHECK: editor tool pages');
      const editorId=JSON.parse(fs.readFileSync(path.join(artifacts,'editor-project.json'),'utf8')).id;
      await page.goto(base+`/story/${editorId}`);await page.getByRole('button',{name:/4\. Edit & Export/}).click();
      await jump('preview');await expect(page.getByRole('heading',{name:'Watch your story',exact:true})).toBeVisible();
      await expect(page.getByRole('button',{name:'Add text',exact:true})).toHaveCount(0);
      await jump('arrange');await expect(page.getByRole('button',{name:'Split here',exact:true}).first()).toBeVisible();
      await jump('text');await expect(page.getByRole('button',{name:'Add text',exact:true}).first()).toBeVisible();
      await expect(page.getByRole('button',{name:'Split here',exact:true}).first()).toBeHidden();
      await jump('audio');await expect(page.getByText('Clip audio',{exact:true}).first()).toBeVisible();
      await jump('export');await expect(page.getByRole('heading',{name:'Download your story',exact:true})).toBeVisible();
      await page.screenshot({path:path.join(artifacts,'guided-export-desktop.png'),fullPage:true});
      console.log(`PASS: authenticated story navigation, saved rough idea, one-decision setup/script/characters/direction/editor, connected scrolling progress, mobile account links${liveAI?', and three real contextual Omni responses':''}. No image/video generation or export submitted.`);
    }
    if(paid.length)throw new Error('Unexpected generation request');
    if(errors.length)throw new Error(errors.join('\n'));
  }catch(error){await page.screenshot({path:path.join(artifacts,authenticated?'guided-auth-failure.png':'guided-public-failure.png'),fullPage:true}).catch(()=>{});throw error;}
  finally{
    if(temporaryStory)await page.request.delete(`${base}/api/studio/${temporaryStory}`).catch(()=>{});
    await context.close();if(browser)await browser.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
