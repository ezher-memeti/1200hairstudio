const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
function load(file){const module={exports:{}};const code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','module','exports',code)(name=>name.startsWith('.')?load(path.join(path.dirname(file),name+'.ts')):require(name),module,module.exports);return module.exports;}
const {analyticsEnabled,analyticsPage}=load('src/lib/analytics/policy.ts');
const {AnalyticsController}=load('src/lib/analytics/client.ts');
const {CONSENT_KEY,COMPLETIONS_KEY,CONSENT_LIFETIME,readConsent}=load('src/lib/analytics/consent.ts');
const config={production:true,measurementId:'G-TEST123456',origin:'https://studio.example',siteMode:'live'};
function storage(){const values=new Map();return{getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};}
function fixture(settings={}){const commands=[],deletions=[];const win={location:{href:'https://studio.example/de',hostname:'studio.example'},crypto:require('node:crypto').webcrypto,localStorage:storage(),sessionStorage:storage(),gtag:(...args)=>commands.push(args),document:{get cookie(){return '_ga=synthetic; _ga_TEST=synthetic; sb-auth=synthetic; 1200_locale=de';},set cookie(value){deletions.push(value);}}};const controller=new AnalyticsController({...config,...settings},win);return{win,controller,commands,deletions,events:()=>commands.filter(a=>a[0]==='event')};}
let count=0;async function test(name,fn){await fn();count++;console.log('PASS '+name);}
(async()=>{
await test('Only configured production origin and public localized routes are eligible',()=>{
 for(const locale of ['de','en'])for(const route of ['','/book','/privacy','/imprint','/coming-soon','/under-construction'])assert(analyticsEnabled(config,config.origin+'/'+locale+route));
 for(const href of ['http://localhost:3000/de','https://preview.example/de','https://studio.example/de/admin','https://studio.example/en/admin/login','https://studio.example/de/account','https://studio.example/en/login','https://studio.example/de/register','https://studio.example/de/reset-password','https://studio.example/en/forgot-password','https://studio.example/de/booking/manage/synthetic.private','https://studio.example/en/unsubscribe/synthetic.private','https://studio.example/api/health','https://studio.example/de/unknown','https://studio.example/de?code=synthetic','https://studio.example/en#access_token=synthetic'])assert.equal(analyticsEnabled(config,href),false);
 for(const patch of [{production:false},{measurementId:''},{measurementId:'not-an-id'},{origin:'http://localhost:3000'}])assert.equal(analyticsEnabled({...config,...patch},config.origin+'/de'),false);
 assert.deepEqual(analyticsPage(config.origin+'/en/book?utm_source=synthetic#booking'),{path:'/en/book',locale:'en',title:'1200 HAIRSTUDIO | Booking'});
});
await test('Unknown, rejected and expired consent create no tag commands or events',()=>{
 const f=fixture();assert.equal(f.controller.sync(),false);f.controller.event('booking_cta_clicked');f.controller.tagReady();assert.equal(f.commands.length,0);f.controller.choose(false);assert.equal(f.controller.sync(),false);assert.equal(f.commands.length,0);
 f.win.localStorage.setItem(CONSENT_KEY,JSON.stringify({version:1,analytics:true,expires:Date.now()-1}));assert.equal(f.controller.sync(),false);assert.equal(f.commands.length,0);
});
await test('Consent parser fails closed for malformed, old-version and unbounded decisions',()=>{
 const s=storage();for(const value of ['invalid','{}',JSON.stringify({version:0,analytics:true,expires:Date.now()+1000}),JSON.stringify({version:1,analytics:'true',expires:Date.now()+1000}),JSON.stringify({version:1,analytics:true,expires:Date.now()+CONSENT_LIFETIME*2})]){s.setItem(CONSENT_KEY,value);assert.equal(readConsent(s),null);}
});
await test('Legacy accepted/rejected v1 records retain permission and original expiry without rewriting storage',()=>{
 for(const analytics of [true,false]){const values=storage();const expires=Date.now()+86400000;const raw=JSON.stringify({version:1,analytics,expires});values.setItem(CONSENT_KEY,raw);const parsed=readConsent(values);assert.equal(parsed.analytics,analytics);assert.equal(parsed.status,analytics?'accepted':'rejected');assert.equal(parsed.expires,expires);assert.equal(parsed.decidedAt,expires-CONSENT_LIFETIME);assert.equal(parsed.policyVersion,'analytics-v1');assert.equal(values.getItem(CONSENT_KEY),raw);}
});
await test('New choices record status, decision time and policy version; incompatible policies fail closed',()=>{
 const f=fixture();for(const analytics of [true,false]){const before=Date.now();f.controller.choose(analytics);const raw=JSON.parse(f.win.localStorage.getItem(CONSENT_KEY));assert.equal(raw.status,analytics?'accepted':'rejected');assert(raw.decidedAt>=before&&raw.decidedAt<=Date.now());assert.equal(raw.expires-raw.decidedAt,CONSENT_LIFETIME);assert.equal(raw.policyVersion,'analytics-v1');assert(readConsent(f.win.localStorage));}
 const saved=JSON.parse(f.win.localStorage.getItem(CONSENT_KEY));for(const patch of [{status:'accepted'},{policyVersion:'materially-different'},{decidedAt:saved.expires+1}]){f.win.localStorage.setItem(CONSENT_KEY,JSON.stringify({...saved,...patch}));assert.equal(readConsent(f.win.localStorage),null);}
});
await test('Consent Mode v2 starts denied; opt-in enables analytics only, with one config and no automatic page views',()=>{
 const f=fixture();f.controller.choose(true);assert(f.controller.sync());assert.equal(f.events().length,0);f.controller.tagReady();f.controller.tagReady();f.controller.sync();
 assert.equal(f.events().filter(a=>a[1]==='page_view').length,1);const initial=f.commands.find(a=>a[0]==='consent'&&a[1]==='default');for(const value of Object.values(initial[2]))assert.equal(value,'denied');
 const update=f.commands.find(a=>a[0]==='consent'&&a[1]==='update')[2];assert.equal(update.analytics_storage,'granted');for(const key of ['ad_storage','ad_user_data','ad_personalization'])assert.equal(update[key],'denied');
 const commands=f.commands.filter(a=>a[0]==='config');assert.equal(commands.length,1);assert.equal(commands[0][2].send_page_view,false);assert.equal(commands[0][2].allow_google_signals,false);
});
await test('Public navigation counts once; same-page hashes, query changes and rerenders do not duplicate page views',()=>{
 const f=fixture();f.controller.choose(true);f.controller.sync();f.controller.tagReady();
 for(const href of ['/de#services','/de?utm_source=synthetic','/de#booking']){f.controller.guardNavigation(config.origin+href);f.win.location.href=config.origin+href;f.controller.sync();}
 assert.equal(f.events().length,1);f.controller.guardNavigation(config.origin+'/en/book');f.win.location.href=config.origin+'/en/book';f.controller.sync();f.controller.sync();assert.equal(f.events().length,2);assert.equal(f.events()[1][2].language,'en');
});
await test('Private navigation is disabled before URL changes and never emits private paths, tokens or referrers',()=>{
 const f=fixture();f.controller.choose(true);f.controller.sync();f.controller.tagReady();const before=f.events().length;
 f.controller.guardNavigation(config.origin+'/en/account?token=synthetic-private');assert.equal(f.win['ga-disable-'+config.measurementId],true);f.win.location.href=config.origin+'/en/account?token=synthetic-private';f.controller.sync();assert.equal(f.controller.event('contact_clicked','phone'),false);assert.equal(f.events().length,before);assert(!JSON.stringify(f.commands).includes('synthetic-private'));
});
await test('Event parameters are allowlisted and never include user input, arbitrary URLs or identifiers',()=>{
 const f=fixture();f.win.location.href=config.origin+'/de/book?note=synthetic-private-name#booking';f.controller.choose(true);f.controller.sync();f.controller.tagReady();f.controller.event('service_selected','synthetic-private');f.controller.event('contact_clicked','phone');f.controller.event('unknown_event','phone');
 assert(!JSON.stringify(f.commands).includes('synthetic-private'));assert(!JSON.stringify(f.commands).includes('?'));assert(!JSON.stringify(f.commands).includes('#'));
 assert.equal(f.events().filter(a=>a[1]==='contact_clicked')[0][2].contact_action,'phone');assert(!f.events().some(a=>a[1]==='unknown_event'));
});
await test('Withdrawal disables immediately, clears only Analytics storage/cookies and drops pending events',()=>{
 const f=fixture();f.controller.choose(true);f.controller.sync();f.controller.event('booking_cta_clicked');f.controller.choose(false);f.controller.tagReady();assert.equal(f.events().length,0);assert.equal(f.win['ga-disable-'+config.measurementId],true);assert(f.deletions.length);assert(f.deletions.every(value=>value.startsWith('_ga')));assert(readConsent(f.win.localStorage).analytics===false);assert.equal(f.controller.event('contact_clicked','phone'),false);
});
await test('Persisted consent and cross-tab rejection are respected without replaying events',()=>{
 const f=fixture();f.controller.choose(true);const other=new AnalyticsController(config,f.win);other.sync();other.tagReady();f.win.localStorage.setItem(CONSENT_KEY,JSON.stringify({version:1,analytics:false,expires:Date.now()+10000}));assert.equal(other.event('booking_cta_clicked'),false);assert.equal(other.sync(),false);
});
await test('Booking start is once per flow; explicit new-booking reset allows another start',()=>{
 const f=fixture();f.controller.choose(true);f.controller.sync();f.controller.tagReady();f.controller.startBooking();f.controller.startBooking();const another=new AnalyticsController(config,f.win);another.sync();another.tagReady();another.startBooking();assert.equal(f.events().filter(a=>a[1]==='booking_started').length,1);another.resetBooking();another.startBooking();assert.equal(f.events().filter(a=>a[1]==='booking_started').length,2);
});
await test('Confirmed success deduplicates concurrent retries, reloads and navigation using local hashes only',async()=>{
 const f=fixture();f.controller.choose(true);f.controller.sync();f.controller.tagReady();const reference='synthetic-private-reference';await Promise.all([f.controller.completed(reference),f.controller.completed(reference)]);assert.equal(f.events().filter(a=>a[1]==='booking_completed').length,1);assert(!JSON.stringify(f.commands).includes(reference));assert(!f.win.localStorage.getItem(COMPLETIONS_KEY).includes(reference));
 const another=new AnalyticsController(config,f.win);another.sync();another.tagReady();assert.equal(await another.completed(reference),false);assert.equal(await another.completed(null),false);assert.equal(await another.completed('synthetic-different-reference'),true);assert.equal(f.events().filter(a=>a[1]==='booking_completed').length,2);
});
await test('Blocked storage, crypto or Google tag errors never throw into business functionality',async()=>{
 const f=fixture();f.controller.choose(true);f.controller.sync();f.controller.tagReady();f.win.localStorage.setItem=()=>{throw Error('blocked');};assert.equal(await f.controller.completed('synthetic'),false);f.win.gtag=()=>{throw Error('tag error');};assert.doesNotThrow(()=>f.controller.event('service_selected'));assert.doesNotThrow(()=>f.controller.sync());assert.doesNotThrow(()=>f.controller.choose(false));
});
await test('Withdrawal during asynchronous completion hashing prevents a late conversion or duplicate marker',async()=>{
 const f=fixture();f.controller.choose(true);f.controller.sync();f.controller.tagReady();let finish;f.win.crypto={subtle:{digest:()=>new Promise(resolve=>{finish=resolve;})}};const pending=f.controller.completed('synthetic-private-reference');f.controller.choose(false);finish(new ArrayBuffer(32));assert.equal(await pending,false);assert.equal(f.win.localStorage.getItem(COMPLETIONS_KEY),null);assert.equal(f.events().filter(a=>a[1]==='booking_completed').length,0);
});
await test('Developer link uses fixed non-personal parameters, respects consent in all modes and never replays on tag-ready',()=>{
 for(const siteMode of ['live','coming_soon','under_construction']){
  const f=fixture({siteMode});assert.equal(f.controller.event('footer_developer_link_click'),false);
  f.controller.choose(false);assert.equal(f.controller.event('footer_developer_link_click'),false);
  f.controller.choose(true);f.controller.sync();assert.equal(f.controller.event('footer_developer_link_click'),true);f.controller.tagReady();f.controller.tagReady();f.controller.sync();
  const clicks=f.events().filter(a=>a[1]==='footer_developer_link_click');assert.equal(clicks.length,1);assert.equal(clicks[0][2].link_location,'footer');assert.equal(clicks[0][2].link_destination,'linkedin');assert(!JSON.stringify(clicks).includes('linkedin.com'));assert(!JSON.stringify(clicks).includes('Memeti'));
  f.controller.choose(false);assert.equal(f.controller.event('footer_developer_link_click'),false);assert.equal(f.events().filter(a=>a[1]==='footer_developer_link_click').length,1);
 }
});
await test('All site modes allow public visits/contact; closed modes block booking conversions',async()=>{
 for(const mode of ['live','coming_soon','under_construction']){const f=fixture({siteMode:mode});f.controller.choose(true);f.controller.sync();f.controller.tagReady();assert.equal(f.events().length,1);assert.equal(f.controller.event('contact_clicked','phone'),true);assert.equal(f.controller.event('instagram_clicked'),true);assert.equal(f.controller.event('booking_cta_clicked'),mode==='live');assert.equal(f.controller.event('service_selected'),mode==='live');assert.equal(await f.controller.completed('synthetic-'+mode),mode==='live');if(mode!=='live')assert(f.events()[0][2].page_path.endsWith(mode==='coming_soon'?'coming-soon':'under-construction'));}
});
console.log(`${count} Analytics test groups passed; synthetic browser storage, no Google requests, database access or notifications.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
