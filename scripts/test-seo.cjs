const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function load(file) {
  const module = {exports:{}};
  const code = ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('require','module','exports',code)(name=>{
    if(name==='server-only')return {};
    if(name.startsWith('@/'))return load('src/'+name.slice(2)+'.ts');
    if(name.startsWith('.'))return load(path.join(path.dirname(file),name+'.ts'));
    return require(name);
  },module,module.exports);
  return module.exports;
}
let count=0;
function test(name,fn){fn();count++;console.log('PASS '+name);}
const {publicMetadata,indexablePaths}=load('src/lib/seo/metadata.ts');
const origin='https://studio.example';
test('Every public route has unique localized metadata and reciprocal absolute alternates',()=>{
  for(const locale of ['de','en']){
    const titles=new Set(),descriptions=new Set();
    for(const route of indexablePaths){
      const url=`/${locale}${route==='/'?'':route}`;
      const meta=publicMetadata(origin,locale,url);
      assert(meta.robots.index);assert.equal(meta.alternates.canonical,origin+url);
      assert.equal(meta.alternates.languages['x-default'],meta.alternates.languages['de-CH']);
      assert.equal(meta.alternates.languages.en,origin+'/en'+(route==='/'?'':route));
      assert.equal(meta.alternates.languages['de-CH'],origin+'/de'+(route==='/'?'':route));
      assert.equal(meta.openGraph.url,origin+url);assert.equal(meta.openGraph.type,'website');
      assert.equal(meta.openGraph.images[0].url,origin+'/brand/open-graph.webp');assert.equal(meta.twitter.card,'summary_large_image');
      assert.equal(meta.openGraph.images.length,1); assert.equal(meta.twitter.images.length,1);
      assert.equal(meta.openGraph.images[0].type,'image/webp');assert.equal(meta.openGraph.images[0].width,1731);assert.equal(meta.openGraph.images[0].height,909);
      assert.equal(meta.icons.apple[0].url,'/apple-touch-icon.png');assert.equal(meta.icons.icon.length,4);
      titles.add(meta.title);descriptions.add(meta.description);
    }
    assert.equal(titles.size,4);assert.equal(descriptions.size,4);
  }
});
test('Private, tokenized, unknown, and temporary paths never emit indexable metadata or private canonical URLs',()=>{
  for(const locale of ['de','en'])for(const route of ['/admin','/admin/customers','/account','/login','/register','/forgot-password','/reset-password','/booking/manage/synthetic.private','/unsubscribe/synthetic.private','/missing','/coming-soon','/under-construction']){
    const meta=publicMetadata(origin,locale,`/${locale}${route}`);
    assert.equal(meta.robots.index,false);assert.equal(meta.alternates,undefined);assert(!JSON.stringify(meta).includes('synthetic.private'));
  }
});
test('Sitemap changes at request time in all three site modes, has no fabricated dates or private paths',()=>{
  const original=process.env.APP_SITE_MODE,oldOrigin=process.env.NEXT_PUBLIC_SITE_URL;
  try{process.env.NEXT_PUBLIC_SITE_URL=origin;
    const sitemap=load('src/app/sitemap.ts').default;
    for(const mode of ['live','coming_soon','under_construction']){
      process.env.APP_SITE_MODE=mode;const entries=sitemap();assert.equal(entries.length,mode==='live'?8:0);
      for(const item of entries){assert(item.url.startsWith(origin));assert(!item.lastModified);assert(item.alternates.languages['x-default']);}
    }
  }finally{if(original===undefined)delete process.env.APP_SITE_MODE;else process.env.APP_SITE_MODE=original;if(oldOrigin===undefined)delete process.env.NEXT_PUBLIC_SITE_URL;else process.env.NEXT_PUBLIC_SITE_URL=oldOrigin;}
});
test('Robots allows rendering and noindex discovery; authentication remains the access control',()=>{
  const robots=load('src/app/robots.ts').default();assert.equal(robots.rules.allow,'/');assert.deepEqual(robots.rules.disallow,['/api/','/auth/']);assert(robots.sitemap.endsWith('/sitemap.xml'));
});
const {businessStructuredData,serializeJsonLd}=load('src/lib/seo/business.ts');
const content={visit_address_line_1:'Synthetic Street 1',visit_address_line_2:'8599 Salmsach'};
test('Schema reuses visible business data, shares one entity across locales, and omits unverified attributes',()=>{
  const contact={isEnabled:true,callCtaLabel:'Call',phoneNumber:'+41 71 000 00 00',instagramEnabled:true,instagramUrl:'https://www.instagram.com/synthetic/'};
  const hours=[{day_of_week:1,is_closed:false,open_time:'09:00:00',close_time:'18:00:00'},{day_of_week:7,is_closed:true,open_time:null,close_time:null}];
  const de=businessStructuredData(origin,'de',content,contact,hours),en=businessStructuredData(origin,'en',content,contact,hours);
  assert.equal(de['@type'],'HairSalon');assert.equal(de['@id'],en['@id']);assert.equal(de.address.streetAddress,content.visit_address_line_1);
  assert.equal(de.telephone,'+41710000000');assert.equal(de.openingHoursSpecification.length,1);assert.equal(de.openingHoursSpecification[0].opens,'09:00');
  for(const key of ['geo','priceRange','aggregateRating','review'])assert(!(key in de));
  const sparse=businessStructuredData(origin,'en',{...content,visit_address_line_2:'Unknown'},null,[]);
  for(const key of ['address','telephone','sameAs','openingHoursSpecification'])assert(!(key in sparse));
});
test('JSON-LD safely escapes script termination in managed public content',()=>{
  const value={name:'</script><script>alert(1)</script>'};assert(!serializeJsonLd(value).includes('<'));assert.deepEqual(JSON.parse(serializeJsonLd(value)),value);
});
console.log(`${count} SEO regression groups passed. Synthetic data only; no database mutations.`);
