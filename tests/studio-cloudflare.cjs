const assert = require('node:assert/strict');
const sharp = require('sharp');
const { loadTs } = require('../scripts/test-studio.cjs');
class StudioError extends Error { constructor(message,status=400){super(message);this.status=status;} }

(async()=>{
  const image = await sharp({create:{width:900,height:700,channels:3,background:'#c1f17b'}}).png().toBuffer();
  let calls=0, uploads=0, status=200, invalid=false, configured=true;
  const {startCloudflareImage}=loadTs('lib/studio/cloudflare.ts',{
    '@/lib/env':{getEnvValue:names=>configured?({CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),CLOUDFLARE_API_TOKEN:'test-only-token'})[names[0]]||'':''},
    './store':{StudioError,referenceData:async(workspace,id)=>{assert.equal(workspace,'owned-workspace'); assert.equal(id,'owned-reference'); return {data:image.toString('base64'),mimeType:'image/png'};}},
    '@/lib/supabase-storage':{uploadToSupabaseStorage:async input=>{uploads++;assert.equal(input.bucket,'generated-images');assert.match(input.path,/^studio\/owned-workspace\/cloudflare\/.*\.png$/); const metadata=await sharp(input.body).metadata();assert.equal(metadata.format,'png');return {publicUrl:'https://storage.example/generated.png'};}},
    fetch:async(url,init)=>{
      calls++;assert.match(url,/api.cloudflare.com\/client\/v4\/accounts\/a+\/ai\/run\/@cf\/black-forest-labs\/flux-2-klein-4b$/);
      assert.equal(init.headers.Authorization,'Bearer test-only-token');assert.equal(init.headers['Content-Type'],undefined,'Fetch must supply the multipart boundary');
      assert.ok(init.body instanceof FormData);assert.equal(init.body.get('width'),'1024');assert.equal(init.body.get('height'),'576');
      const reference=init.body.get('input_image_0');assert.ok(reference instanceof Blob);
      const metadata=await sharp(Buffer.from(await reference.arrayBuffer())).metadata();assert.ok(metadata.width<=512&&metadata.height<=512,'Real references are resized to the documented input bounds');
      assert.match(init.body.get('prompt'),/image 0 = Hina/);
      return new Response(JSON.stringify({success:status===200,result:{image:invalid?'not an image':image.toString('base64')}}),{status,headers:{'content-type':'application/json'}});
    },
  });
  const request={prompt:'Hina reads the village archive.',referenceIds:['owned-reference'],identity:[{characterId:'hina',name:'Hina',appearance:'Dark hair',referenceIds:['owned-reference'],key:'locked-id'}]};
  const take=await startCloudflareImage('owned-workspace',request);
  assert.equal(take.provider,'cloudflare');assert.equal(take.status,'complete');assert.equal(take.stored,true);assert.equal(take.continuity.status,'pending');assert.equal(take.url,'https://storage.example/generated.png');assert.equal(uploads,1);
  status=403;await assert.rejects(()=>startCloudflareImage('owned-workspace',request),/Workers AI permission/);assert.equal(calls,2,'Failures never retry or fall back to another paid provider');assert.equal(uploads,1);
  status=200;invalid=true;await assert.rejects(()=>startCloudflareImage('owned-workspace',request),/invalid image/);assert.equal(uploads,1);
  await assert.rejects(()=>startCloudflareImage('owned-workspace',{...request,referenceIds:['a','b','c','d','e']}),/four reference/);assert.equal(calls,3);
  configured=false;await assert.rejects(()=>startCloudflareImage('owned-workspace',request),/not configured/);assert.equal(calls,3);
  console.log('PASS: Cloudflare multipart input, owned reference pixels, resizing, identity mapping, PNG output/storage, configuration and permission errors, and no paid retries/fallback. No provider requests were made.');
})().catch(error=>{console.error(error);process.exitCode=1;});
