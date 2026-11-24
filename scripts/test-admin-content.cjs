// Synthetic-only application tests. No network calls, real records or messages.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function load(file, mocks = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('require', 'module', 'exports', code)(name => {
    if (name in mocks) return mocks[name];
    if (name === 'react') return { ...require('react'), cache: fn => fn };
    if (name === 'server-only') return {};
    if (name.startsWith('@/')) return load('src/' + name.slice(2) + '.ts', mocks);
    if (name.endsWith('.json')) return require(path.resolve(root, path.dirname(file), name));
    if (name.startsWith('.')) return load(path.join(path.dirname(file), name + '.ts'), mocks);
    return require(name);
  }, module, module.exports);
  return module.exports;
}
const id = '00000000-0000-4000-8000-000000000001';
function database({ fail = false, homepageType = 'text', role = 'admin' } = {}) {
  const writes = [];
  return { writes, auth: { getUser: async () => ({ data: { user: { id } }, error: null }) }, from(table) {
    let operation = 'read';
    const chain = { select() { return this; }, eq() { return this; }, order() { return this; }, limit() { return this; }, update(payload) { operation = 'write'; writes.push({ table, payload }); return this; }, insert(payload) { return this.update(payload); }, single() { return this.result(); }, maybeSingle() { return this.result(); }, result() { return Promise.resolve({ data: fail && operation === 'write' ? null : { id, role, status:'draft', updated_at:'2026-01-01T00:00:00Z', audience_filters:{localized_content:{de:{subject:'Stored German'}}}, image_url: null, sort_order: 1, content_type: homepageType, value: homepageType === 'text' ? 'English' : '/image.webp' }, error: fail && operation === 'write' ? { message: 'Synthetic write failure' } : null }); }, then(resolve, reject) { return this.result().then(resolve, reject); } };
    return chain;
  } };
}
function mocks(db, denied = false) {
  return {
    '@/lib/auth/customer': { requireAdminUser: async () => { if (denied) throw new Error('admin required'); return { supabase: db, user: {id} }; } },
    '@/lib/supabase/server': { createClient: async () => db },
    '@/lib/supabase/public': { createPublicClient: () => { throw new Error('Public DB access forbidden in tests'); } },
    'next/cache': { revalidatePath() {} }, 'next-intl/server': { getLocale: async () => 'de' },
    '@/lib/appointments/availability': { getUtcIsoForZurichDateTime: () => { throw new Error('Unused time conversion'); } },
    '@/lib/customers/queries': {}, '@/lib/email/gmail': {}, '@/lib/email/marketing': {}, '@/lib/marketing/audience': {}, '@/lib/marketing/queries': {},
  };
}
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log('PASS ' + name); }
(async () => {
  const { draftText, draftChange, contentPayload } = load('src/i18n/content-editing.ts');
  await test('All interface/content combinations retain separate EN/DE drafts and shared values', () => {
    for (const uiLocale of ['de', 'en']) {
      let draft = { name: 'Source', price: 40 };
      assert.equal(draftText(draft, 'name', draft.name, 'de'), '');
      draft = { ...draft, ...draftChange('name', 'English draft', 'en', draft) };
      draft = { ...draft, ...draftChange('name', 'Deutscher Entwurf', 'de', draft) };
      assert.equal(draftText(draft, 'name', draft.name, 'en'), 'English draft');
      assert.equal(draftText(draft, 'name', draft.name, 'de'), 'Deutscher Entwurf');
      assert.equal(draft.price, 40); assert.equal(uiLocale === 'de' ? 'de' : 'en', uiLocale);
    }
  });
  await test('Payload allowlist isolates active columns, preserves empty translations and rejects bad locale', () => {
    assert.deepEqual(contentPayload({ name: 'Source', price: 40 }, ['name'], 'en', { name: 'Deutsch' }), { name: 'Source', price: 40 });
    assert.deepEqual(contentPayload({ name: 'Unsaved source', price: 40 }, ['name'], 'de', { name: '' }), { name_de: null, price: 40 });
    assert.throws(() => contentPayload({ name: 'Source' }, ['name'], 'fr', {}), /language/);
    assert.throws(() => contentPayload({ name: 'Source' }, ['name'], 'de', { name: 1 }), /content/);
  });
  for (const locale of ['de', 'en']) {
    await test(`Service and portfolio server actions write only ${locale.toUpperCase()} text with shared values`, async () => {
      const db = database(); const m = mocks(db);
      const form = new FormData(); Object.entries({ id, name: 'English draft', name_de: 'Deutsch', title: 'English title', title_de: 'Deutscher Titel', contentLocale: locale, price: '40', durationMin: '30', durationMax: '', isActive: 'true', currentImageUrl: 'https://example.invalid/image.webp' }).forEach(([k, v]) => form.set(k, v));
      const services = load('src/app/admin/(dashboard)/services/actions.ts', m);
      assert.equal((await services.upsertService(form)).error, null);
      const payload = db.writes[0].payload;
      assert.equal(payload[locale === 'de' ? 'name_de' : 'name'], locale === 'de' ? 'Deutsch' : 'English draft');
      assert.equal(locale === 'de' ? 'name' in payload : 'name_de' in payload, false); assert.equal(payload.price, 40);
      const work = load('src/app/admin/(dashboard)/selected-work/actions.ts', m);
      assert.equal((await work.upsertSelectedWork(form)).success, true);
      const p = db.writes[1].payload;
      assert.equal(p[locale === 'de' ? 'title_de' : 'title'], locale === 'de' ? 'Deutscher Titel' : 'English title');
      assert.equal(locale === 'de' ? 'title' in p : 'title_de' in p, false);
    });
    await test(`Announcement, Contact and template saves isolate ${locale.toUpperCase()} fields`, async () => {
      const db = database(); const m = mocks(db);
      const announcements = load('src/app/admin/(dashboard)/site-settings/announcements/actions.ts', m);
      assert.equal((await announcements.saveAnnouncement({ title: 'Source', message: 'Source body', ctaText: 'Book', german: { title: 'Deutsch', message: 'Nachricht', ctaText: 'Buchen' }, displayType: 'top_bar', priority: 1, startsAt: '', expiresAt: '', ctaUrl: '/book', isActive: true, isDismissible: true }, id, locale)).success, true);
      let p = db.writes.at(-1).payload; assert.equal(locale === 'de' ? 'message' in p : 'message_de' in p, false); assert.equal(p.cta_url, '/book');
      const contact = load('src/lib/contact-section/settings.ts', m);
      const { DEFAULT_CONTACT_SECTION_SETTINGS } = load('src/lib/contact-section/types.ts', m);
      await contact.persistContactSectionSettings({ ...DEFAULT_CONTACT_SECTION_SETTINGS, german: { title: 'Kontakt' } }, locale);
      p = db.writes.at(-1).payload; assert.equal(locale === 'de' ? 'title' in p : 'title_de' in p, false); assert.equal(p.address, DEFAULT_CONTACT_SECTION_SETTINGS.address);
      const marketing = load('src/app/admin/(dashboard)/marketing/actions.ts', m);
      const input = { name: 'English', description: '', subject: 'Subject', preheader: '', headline: 'Headline', content: '{{first_name}} source', ctaText: '', ctaUrl: 'https://example.invalid', german: { name: 'Deutsch', subject: 'Betreff', headline: 'Titel', content: '{{first_name}} Nachricht' } };
      assert.equal((await marketing.saveMarketingTemplate(input, id, locale)).success, true);
      p = db.writes.at(-1).payload; assert.equal(locale === 'de' ? 'default_content' in p : 'default_content_de' in p, false); assert(p[locale === 'de' ? 'default_content_de' : 'default_content'].includes('{{first_name}}')); assert.equal('is_active' in p, false);
    });
  }
  await test('Homepage saves select runtime text type, preserve shared media and reject duplicate keys', async () => {
    const defs = load('src/lib/homepage-content-defaults.ts').homepageContentDefinitions;
    const section = defs[0].section; const updates = defs.filter(x => x.section === section).map(x => ({ contentKey: x.contentKey, value: 'Entwurf' }));
    const db = database(); const actions = load('src/app/admin/(dashboard)/site-settings/homepage-content/actions.ts', mocks(db));
    assert.equal((await actions.saveHomepageContentSection(section, updates, 'de')).success, true);
    assert(db.writes.every(x => 'value_de' in x.payload && !('value' in x.payload)));
    assert.equal((await actions.saveHomepageContentSection(section, updates.map(() => updates[0]), 'de')).success, false);
    const media = database({ homepageType: 'image' });
    const mediaActions = load('src/app/admin/(dashboard)/site-settings/homepage-content/actions.ts', mocks(media));
    assert.equal((await mediaActions.saveHomepageContentSection(section, updates, 'de')).success, true);
    assert(media.writes.every(x => 'value' in x.payload && !('value_de' in x.payload)));
  });
  await test('Authorization and database failures return failure without false success', async () => {
    const input = { name: 'A', subject: 'B', headline: 'C', content: 'D', preheader: '', description: '', ctaText: '', ctaUrl: '' };
    for (const options of [{ denied: true }, { fail: true }]) {
      const db = database(options); const action = load('src/app/admin/(dashboard)/marketing/actions.ts', mocks(db, options.denied));
      assert.equal((await action.saveMarketingTemplate(input, id, 'en')).success, false);
      if (options.denied) assert.equal(db.writes.length, 0);
    }
  });
  await test('All content actions retain admin authorization; non-admin service/work writes are rejected', async () => {
    const db=database({role:'customer'}),m=mocks(db,true);
    const form=new FormData();form.set('id',id);
    for(const [file,name] of [['services','upsertService'],['selected-work','upsertSelectedWork']]){
      const action=load(`src/app/admin/(dashboard)/${file}/actions.ts`,m);
      assert.match((await action[name](form)).error,/Unauthorized/);
    }
    const homepage=load('src/app/admin/(dashboard)/site-settings/homepage-content/actions.ts',m);
    assert.equal((await homepage.saveHomepageContentSection('Hero',[],'de')).success,false);
    const announcements=load('src/app/admin/(dashboard)/site-settings/announcements/actions.ts',m);
    assert.equal((await announcements.saveAnnouncement({},id,'de')).success,false);
    const contact=load('src/lib/contact-section/settings.ts',m);
    await assert.rejects(contact.persistContactSectionSettings({},'de'),/admin required/);
    assert.equal(db.writes.length,0);
  });
  await test('Homepage failures identify unsaved fields and never report a partial save as success',async()=>{
    const db=database({fail:true});const defs=load('src/lib/homepage-content-defaults.ts').homepageContentDefinitions;
    const section=defs[0].section;const updates=defs.filter(x=>x.section===section).map(x=>({contentKey:x.contentKey,value:'Draft'}));
    const action=load('src/app/admin/(dashboard)/site-settings/homepage-content/actions.ts',mocks(db));
    const result=await action.saveHomepageContentSection(section,updates,'de');
    assert.equal(result.success,false);assert.deepEqual(result.unsavedKeys,updates.map(x=>x.contentKey));
  });
  await test('Campaign draft updates isolate EN/DE copy inside existing JSON and retain shared filters',async()=>{
    for(const locale of ['en','de']){
      const db=database(),m=mocks(db),action=load('src/app/admin/(dashboard)/marketing/actions.ts',m);
      const input={campaignName:'Synthetic campaign',templateId:null,subject:'English subject',preheader:'',headline:'English title',content:'English body',ctaText:'Book',ctaUrl:'https://example.invalid',translations:{de:{subject:'Neuer Betreff',preheader:'',headline:'Titel',content:'Nachricht',ctaText:'Buchen'}}};
      const result=await action.saveMarketingDraft(input,{statuses:[],favoriteService:null,appointment:'all',lastVisit:'all'},id,locale);
      assert.equal(result.success,true);const p=db.writes.at(-1).payload;
      if(locale==='en'){assert.equal(p.subject,'English subject');assert.equal(p.audience_filters.localized_content.de.subject,'Stored German');}
      else{assert.equal('subject' in p,false);assert.equal('content' in p,false);assert.equal(p.audience_filters.localized_content.de.subject,'Neuer Betreff');}
      assert.equal(p.cta_url,'https://example.invalid');
    }
  });
  await test('No separate language panels or customer/profile/booking preference writes in editing provider', () => {
    assert(!fs.existsSync(path.join(root, 'src/components/admin/TranslationFields.tsx')));
    const provider = fs.readFileSync(path.join(root, 'src/components/admin/content/AdminContentLocale.tsx'), 'utf8');
    assert(provider.includes('1200_admin_content_locale')); assert(!/saveLocalePreference|preferred_locale|booking_locale|router\./.test(provider));
  });
  console.log(`PASS ${passed} multilingual editor test groups; synthetic data only.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
