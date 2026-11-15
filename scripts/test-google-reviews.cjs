const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const moduleUnderTest = { exports: {} };
const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib/google-reviews/server.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
new Function('require', 'module', 'exports', source)((name) => name === 'server-only' ? {} : name === 'react' ? { cache: (fn) => fn } : require(name), moduleUnderTest, moduleUnderTest.exports);
const { parseGoogleReviews, getGoogleReviews } = moduleUnderTest.exports;
const TEST_PLACE_ID = 'synthetic-place-id';
const sample = {
  displayName: { text: 'Synthetic test business' }, rating: 4.7, userRatingCount: 40,
  googleMapsUri: 'https://maps.google.com/?cid=test',
  googleMapsLinks: { reviewsUri: 'https://www.google.com/maps/reviews/test', writeAReviewUri: 'https://www.google.com/maps/write/test' },
  reviews: [{ name: 'places/test/reviews/1', rating: 4, text: { text: 'Translated fixture', languageCode: 'en' }, originalText: { text: 'Sehr guter Schnitt — شكراً!', languageCode: 'de' }, authorAttribution: { displayName: 'Synthetic reviewer', uri: 'https://maps.google.com/profile/test', photoUri: 'https://lh3.googleusercontent.com/test' }, googleMapsUri: 'https://www.google.com/maps/reviews/one', publishTime: '2026-01-01T12:00:00Z', relativePublishTimeDescription: '10 months ago' }],
  attributions: [{ provider: 'Synthetic source', providerUri: 'https://example.com' }],
};
// Render the real client component with effects disabled (server markup only).
function renderReviews(data) {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const component = { exports: {} };
  const css = Object.fromEntries([...fs.readFileSync(path.join(__dirname, '../src/components/home/google-reviews/google-reviews.module.css'), 'utf8').matchAll(/\.([A-Za-z][\w-]*)/g)].map((m) => [m[1], m[1]]));
  const compiled = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/components/home/google-reviews/GoogleReviewsClient.tsx'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require','module','exports',compiled)((name)=>{
    if(name==='react')return {...React,useLayoutEffect:()=>{}};
    if(name==='next/image')return ({unoptimized,...props})=>React.createElement('img',props);
    if(name.endsWith('.module.css'))return css;
    return require(name);
  },component,component.exports);
  return renderToStaticMarkup(React.createElement(component.exports.default,{data}));
}
function loadComponent(file, mocks = {}) {
  const component = { exports: {} };
  const compiled = ts.transpileModule(fs.readFileSync(path.join(__dirname, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('require', 'module', 'exports', compiled)((name) => mocks[name] ?? require(name), component, component.exports);
  return component.exports.default;
}
async function renderContact(place, overrides = {}) {
  const React = require('react');
  const Contact = loadComponent('../src/components/home/ContactSection.tsx');
  let calls = 0;
  const Loader = loadComponent('../src/components/home/ContactSectionLoader.tsx', {
    './ContactSection': { default: Contact },
    '@/lib/google-reviews/server': { getGoogleReviews: async () => { calls++; return place; } },
  });
  const settings = { isEnabled: true, googleReviewsEnabled: true, leaveReviewCtaLabel: 'Leave Review',
    phoneNumber: '+41000000000', callCtaLabel: 'Call', instagramEnabled: true,
    instagramUrl: 'https://instagram.com/synthetic', instagramCtaLabel: 'Instagram',
    googleLeaveReviewUrl: 'https://unverified.example/review', eyebrow: 'Contact', title: 'Connect', ...overrides };
  const html = require('react-dom/server').renderToStaticMarkup(await Loader({settings}));
  assert.equal(settings.googleLeaveReviewUrl, 'https://unverified.example/review', 'Stored settings are not mutated');
  return { html, calls };
}
const savedPlaceId = process.env.GOOGLE_PLACE_ID;
const savedKey = process.env.GOOGLE_PLACES_API_KEY, savedFetch = global.fetch, savedWarn = console.warn;
const logs = []; console.warn = (...v) => logs.push(JSON.stringify(v));
let count = 0;
async function test(name, fn) { await fn(); count++; console.log('PASS '+name); }
(async()=>{try{
  process.env.GOOGLE_PLACE_ID = TEST_PLACE_ID;
  await test('Authentic values, original multilingual text and full author/source attribution preserved',()=>{
    const d=parseGoogleReviews(sample); assert.equal(d.name,sample.displayName.text);assert.equal(d.rating,4.7);assert.equal(d.count,40);assert.equal(d.reviews[0].text,sample.reviews[0].originalText.text);assert.equal(d.reviews[0].author,'Synthetic reviewer');assert.equal(d.reviews[0].uri,sample.reviews[0].googleMapsUri);assert.equal(d.reviews[0].relativeDate,'10 months ago');assert.equal(d.attributions[0].name,'Synthetic source');assert.equal(d.writeUri,sample.googleMapsLinks.writeAReviewUri);
  });
  await test('Missing/invalid place values never create fake ratings or counts',()=>{
    for(const value of [null,{}, {...sample,userRatingCount:-1},{...sample,displayName:null},{...sample,googleMapsUri:'javascript:bad'}]) assert.equal(parseGoogleReviews(value),null);
    assert.equal(parseGoogleReviews({...sample,rating:10}).rating,null);
  });
  await test('Missing source/author/invalid stars excluded, rating-only reviews retained',()=>{
    for(const value of [{...sample.reviews[0],authorAttribution:{}},{...sample.reviews[0],googleMapsUri:null},{...sample.reviews[0],rating:0}]) assert.equal(parseGoogleReviews({...sample,reviews:[value]}).reviews.length,0);
    assert.equal(parseGoogleReviews({...sample,reviews:[{...sample.reviews[0],text:undefined,originalText:undefined}]}).reviews[0].text,'');
    assert.equal(parseGoogleReviews({...sample,reviews:[]}).reviews.length,0);
  });
  await test('Unsafe author/avatar/third-party URLs removed without changing feedback',()=>{
    const d=parseGoogleReviews({...sample,reviews:[{...sample.reviews[0],authorAttribution:{displayName:'Synthetic reviewer',uri:'javascript:alert(1)',photoUri:'data:image/png,invalid'}}],attributions:[{provider:'Synthetic',providerUri:'javascript:bad'}]});assert.equal(d.reviews[0].authorUri,null);assert.equal(d.reviews[0].avatarUri,null);assert.equal(d.attributions[0].uri,null);
  });
  await test('Missing or unsafe review-writing URLs have no constructed fallback',()=>{
    const d=parseGoogleReviews({...sample,googleMapsLinks:undefined});assert.equal(d.reviewsUri,sample.googleMapsUri);assert.equal(d.writeUri,null);for(const uri of ['javascript:bad','http://example.com', 'https://user:password@example.com'])assert.equal(parseGoogleReviews({...sample,googleMapsLinks:{writeAReviewUri:uri}}).writeUri,null);
  });
  await test('Missing configuration hides content without any network call',async()=>{
    delete process.env.GOOGLE_PLACES_API_KEY;global.fetch=async()=>{throw Error('must not fetch');};assert.equal(await getGoogleReviews(),null);process.env.GOOGLE_PLACES_API_KEY='synthetic-private-key';delete process.env.GOOGLE_PLACE_ID;assert.equal(await getGoogleReviews(),null);process.env.GOOGLE_PLACE_ID=TEST_PLACE_ID;
  });
  await test('Official server-side API uses field mask, private header, no cache and no redirects',async()=>{
    process.env.GOOGLE_PLACES_API_KEY='synthetic-private-key';let calls=0;
    global.fetch=async(url,o)=>{calls++;assert.equal(url,'https://places.googleapis.com/v1/places/'+TEST_PLACE_ID+'?languageCode=en');assert.equal(o.headers['X-Goog-Api-Key'],'synthetic-private-key');assert(o.headers['X-Goog-FieldMask'].includes('reviews'));assert.equal(o.cache,'no-store');assert.equal(o.redirect,'error');assert(o.signal instanceof AbortSignal);return Response.json(sample);};assert.equal((await getGoogleReviews()).reviews.length,1);assert.equal(calls,1);
  });
  await test('HTTP errors, bad JSON and network failures hide content and sanitize logs',async()=>{
    for(const fn of [async()=>new Response('private details',{status:403}),async()=>new Response('bad json'),async()=>{throw Error('synthetic-private-key');}]){global.fetch=fn;assert.equal(await getGoogleReviews(),null);}assert(!logs.join('').includes('synthetic-private-key'));
  });
  await test('Timeout aborts provider request without holding up the homepage',async()=>{
    const timer=global.setTimeout;global.setTimeout=(fn,ms)=>{assert.equal(ms,5000);return timer(fn,1);};global.fetch=async(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('timeout')),{once:true}));try{assert.equal(await getGoogleReviews(),null);}finally{global.setTimeout=timer;}
  });
  await test('Refined UI omits large headings/summary while retaining all-reviews and source links',()=>{
    const html=renderReviews(parseGoogleReviews(sample));
    for(const forbidden of ['Client experiences','Words From','Read all reviews','10 months ago','40 reviews'])assert(!html.includes(forbidden));
    assert(!/<h[1-6]\b/.test(html));assert(html.includes('Google Maps'));assert(html.includes(sample.reviews[0].googleMapsUri));
    assert(html.includes('Synthetic reviewer'));assert(html.includes('4 out of 5 stars'));assert(html.includes(sample.reviews[0].originalText.text));
    assert(html.includes('announcement-ticker-track'));assert(html.includes('announcement-ticker-segment'));
    assert(html.includes('View all reviews'));assert(html.includes(sample.googleMapsLinks.reviewsUri));
    assert(!/<(?:button|details)\b/.test(html), 'No extra controls in the compact strip');
    assert(html.includes('class="card"'), 'Compact cards wrap the real review content');
  });
  await test('Repeated visual reviews have exactly one accessible source set',()=>{
    const html=renderReviews(parseGoogleReviews(sample));
    const articles=[...html.matchAll(/<article\b([^>]*)>([\s\S]*?)<\/article>/g)];
    assert(articles.length>2);assert.equal(articles.filter((a)=>!a[1].includes('aria-hidden="true"')).length,1);
    for(const a of articles.filter((a)=>a[1].includes('aria-hidden="true"')))for(const link of a[2].matchAll(/<a\b[^>]*>/g))assert(link[0].includes('tabindex="-1"'));
  });
  await test('Missing photo uses real author initials without fabricating review content',()=>{
    const data=parseGoogleReviews(sample);data.reviews[0].avatarUri=null;
    const html=renderReviews(data);assert(html.includes('>SR</span>'));assert(html.includes(data.reviews[0].text));
  });
  await test('No-review UI hides the marquee instead of leaving a summary or large empty section',()=>{
    assert.equal(renderReviews({...parseGoogleReviews(sample),reviews:[]}),'');
  });
  await test('Contact uses only the official Places writing URL with safe new-tab attributes', async()=>{
    const {html,calls}=await renderContact(parseGoogleReviews(sample));
    assert.equal(calls,1);assert(html.includes('href="'+sample.googleMapsLinks.writeAReviewUri+'" target="_blank" rel="noopener noreferrer"'));
    assert(html.includes('Leave a Google review for 1200 Hairstudio'));assert(!html.includes('unverified.example'));
    assert(html.includes('tel:+41000000000'));assert(html.includes('https://instagram.com/synthetic'));
  });
  await test('Unavailable Places response or writing URL hides only the review action', async()=>{
    for(const place of [null,parseGoogleReviews({...sample,googleMapsLinks:undefined})]){
      const {html}=await renderContact(place);assert(!html.includes('Leave a Google review'));assert(!html.includes('unverified.example'));
      assert(html.includes('tel:+41000000000'));assert(html.includes('https://instagram.com/synthetic'));
    }
  });
  await test('Disabled Contact/review actions do not request Places', async()=>{
    for(const overrides of [{isEnabled:false},{googleReviewsEnabled:false},{leaveReviewCtaLabel:''}]){
      const {html,calls}=await renderContact(parseGoogleReviews(sample),overrides);assert.equal(calls,0);assert(!html.includes('Leave a Google review'));
    }
  });
  console.log(`PASS ${count} Google Reviews tests; synthetic fixtures only, no external calls.`);
}finally{global.fetch=savedFetch;console.warn=savedWarn;if(savedKey===undefined)delete process.env.GOOGLE_PLACES_API_KEY;else process.env.GOOGLE_PLACES_API_KEY=savedKey;if(savedPlaceId===undefined)delete process.env.GOOGLE_PLACE_ID;else process.env.GOOGLE_PLACE_ID=savedPlaceId;}})().catch(e=>{console.error(e);process.exitCode=1;});
