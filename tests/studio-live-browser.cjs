// Real Next.js routes and browser interactions. No auth bypass and no paid jobs.
const fs = require('node:fs');
const path = require('node:path');
const { chromium, expect: baseExpect } = require('@playwright/test');
const expect = baseExpect.configure({timeout:90000});
const base = process.env.STUDIO_TEST_URL || 'http://localhost:3000';
const artifacts = path.resolve('.run-screenshots');
fs.mkdirSync(artifacts, {recursive:true});

(async () => {
  const manual = process.argv.includes('--authenticated');
  const browser = manual ? null : await chromium.launch({ headless: true, channel: 'chrome' });
  const context = manual ? await chromium.launchPersistentContext(path.join(artifacts,'qa-browser'), {
    headless:false,channel:'chrome',viewport:{width:1440,height:1000},
  }) : await browser.newContext({viewport:{width:1440,height:1000}});
  const page = context.pages()[0] || await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.setDefaultTimeout(90000);
  page.on('response', response => {
    const url = new URL(response.url());
    if (url.origin === base && response.status() >= 400 && response.status() !== 401) console.log('HTTP',response.status(),url.pathname);
  });
  try {
    if (!manual) {
      await page.goto(base, {waitUntil:'domcontentloaded',timeout:90000});
      await expect(page.getByRole('heading', {name:/Your story/})).toBeVisible();
      await page.getByRole('link',{name:'Start your film',exact:true}).click();
      await expect(page.getByLabel('What is your film about?')).toBeInViewport();
      await expect(page.locator('.guest-steps li')).toHaveCount(4);
      await expect(page.getByRole('button',{name:'20s',exact:false})).toBeDisabled();
      await page.getByRole('button',{name:/Urdu/}).click();
      await expect(page.locator('.guest-note').filter({hasText:/Urdu video/}).first()).toBeVisible();
      await page.getByRole('button',{name:'English',exact:true}).click();
      await page.getByRole('button',{name:/The last tape/,exact:true}).click();
      await expect(page.getByLabel('What is your film about?')).not.toBeEmpty();
      await expect(page.getByRole('button',{name:'See my scenes'})).toBeEnabled();
      await page.screenshot({path:path.join(artifacts,'live-home-desktop.png'),fullPage:true});
      const video = page.locator('.public-hero video');
      await expect(video).toHaveCount(1);
      await expect.poll(() => video.evaluate(el => ({ready:el.readyState,muted:el.muted,inline:el.playsInline}))).toMatchObject({muted:true,inline:true});
      await page.setViewportSize({width:390,height:844});
      await expect(page.getByLabel('What is your film about?')).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({path:path.join(artifacts,'live-home-mobile.png'),fullPage:true});
      await page.goto(base+'/auth');
      await expect(page.locator('input[type=email]')).toBeVisible();
      await page.goto(base+'/dashboard');
      await expect(page).toHaveURL(/\/auth\?next=/);
      console.log('PASS: real landing page, Start film scrolling, four-step guest form, Guided choices, Urdu notice, gated lengths, mobile layout, sign-in and authenticated route protection. No preview model or GPU submitted.');
    } else {
      await page.goto(base+'/auth',{waitUntil:'domcontentloaded',timeout:90000});
      console.log('READY FOR MANUAL SIGN-IN in the Chrome window. No credentials will be read or logged.');
      await page.waitForURL(url => url.pathname === '/dashboard', {timeout:1800000});
      await expect(page.getByRole('heading',{name:'Your films',exact:true})).toBeVisible();
      await expect(page.getByText(/Could not load projects/)).toHaveCount(0);
      await page.getByRole('button',{name:'Open profile menu'}).click();
      await page.getByRole('menuitem',{name:'View Profile'}).click();
      await expect(page.getByRole('heading',{name:'Profile',exact:true})).toBeVisible();
      await expect(page.getByLabel('Full name')).not.toBeEmpty();
      await page.getByRole('link',{name:'Change password',exact:true}).click();
      await expect(page.getByLabel('New password',{exact:true})).toBeVisible();
      await page.getByRole('link',{name:'Settings',exact:true}).click();
      await expect(page.getByLabel('Pause decorative background videos')).toBeVisible();
      await page.getByRole('link',{name:'Back to films'}).click();
      const projectRecord = path.join(artifacts,'live-project.json');
      if(fs.existsSync(projectRecord)) await page.goto(base+'/film/'+JSON.parse(fs.readFileSync(projectRecord,'utf8')).id);
      else {
        await page.getByRole('button',{name:'New film',exact:true}).click();
        await expect(page).toHaveURL(/\/film\//);
        fs.writeFileSync(projectRecord,JSON.stringify({id:new URL(page.url()).pathname.split('/').pop()}));
      }
      const title = 'Browser validation — saved workflow';
      await page.getByRole('button',{name:/1\. Setup/}).click();
      await page.getByLabel('Film title').fill(title);
      await page.getByLabel('Story idea').fill('A caretaker finds a forgotten rehearsal tape and returns it to the musician.');
      await page.getByLabel('Visual style',{exact:true}).fill('Warm daylight, restrained camera movement');
      await page.getByLabel('Visual style',{exact:true}).blur();
      await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();
      await page.getByText('Shape the story',{exact:false}).first().click();
      await page.getByRole('button',{name:'Warm and hopeful',exact:true}).click();
      await expect(page.getByRole('status').filter({hasText:'Saved'})).toBeVisible();
      await page.reload();
      await expect(page.getByLabel('Story idea')).toHaveValue(/A caretaker/);
      await page.screenshot({path:path.join(artifacts,'live-film-setup.png'),fullPage:true});
      const progress = await page.getByRole('progressbar',{name:'Film completion'}).getAttribute('value');
      await page.getByRole('button',{name:/2\. Script & Characters/}).click();
      await expect(page.getByRole('heading',{name:'Script & Characters',exact:true})).toBeVisible();
      await expect(page.getByRole('progressbar',{name:'Film completion'})).toHaveAttribute('value',progress);
      // This project is owned by this verification run. Archive earlier test
      // scenes through the real undoable UI so a rerun does not accumulate them.
      while(await page.getByLabel('Scene title').count()) {
        const before=await page.getByLabel('Scene title').count();
        page.once('dialog',dialog=>dialog.accept());
        await page.getByRole('button',{name:'Remove scene 1',exact:true}).click();
        await expect(page.getByLabel('Scene title')).toHaveCount(before-1);
      }
      await page.getByRole('button',{name:'Add scene',exact:true}).click();
      await expect(page.getByLabel('Scene title')).toHaveCount(1);
      await page.getByLabel('Visual action',{exact:true}).fill('A caretaker enters an empty rehearsal room.');
      await page.getByLabel('Visual action',{exact:true}).blur();
      await page.getByRole('button',{name:'Add scene',exact:true}).click();
      await expect(page.getByLabel('Scene title')).toHaveCount(2);
      await page.getByRole('button',{name:'Move scene 2 up',exact:true}).click();
      await expect(page.getByLabel('Scene title').first()).toHaveValue('Scene 2');
      page.once('dialog',dialog=>dialog.accept());
      await page.getByRole('button',{name:'Remove scene 1',exact:true}).click();
      await expect(page.getByLabel('Scene title')).toHaveCount(1);
      await page.getByRole('button',{name:'Undo script change',exact:true}).click();
      await expect(page.getByLabel('Scene title')).toHaveCount(2);
      await page.reload();
      await expect(page.getByLabel('Scene title')).toHaveCount(2);
      console.log('PASS: manual authentication, real project list/create/save/reopen, Profile/Password/Settings navigation, state-based progress, scene add/reorder/remove/undo. No GPU or paid preview submitted.');
    }
    if(errors.length) throw Error('Browser errors: '+errors.join('; '));
  } catch(error) {
    await page.screenshot({path:path.join(artifacts,manual?'live-auth-failure.png':'live-public-failure.png'),fullPage:true}).catch(()=>{});
    console.log('Failed page:',new URL(page.url()).pathname);
    throw error;
  } finally {
    if (!manual || !process.argv.includes('--keep-open')) await context.close();
    if(browser) await browser.close();
  }
})().catch(error => { console.error(error.message); process.exitCode=1; });
