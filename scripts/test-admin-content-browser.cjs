// Optional real-Chrome tests of real editor components with synthetic data/actions.
// Dependencies live outside the application; no production credentials are loaded.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { build } = require(process.env.ESBUILD_MODULE_PATH || 'esbuild');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root = path.resolve(__dirname, '..');
const appOrigin = process.env.I18N_TEST_URL || 'http://localhost:3000';
const entry = `
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {NextIntlClientProvider} from 'next-intl';
import en from '${root}/messages/en.json';import de from '${root}/messages/de.json';
import {AdminContentLocaleProvider,ContentEditor} from '${root}/src/components/admin/content/AdminContentLocale';
import Homepage from '${root}/src/components/admin/HomepageContentManager';import Services from '${root}/src/components/admin/SiteSettingsServicesManager';import Work from '${root}/src/components/admin/SelectedWorkManager';import Announcements from '${root}/src/components/admin/AnnouncementsManager';import Contact from '${root}/src/components/admin/ContactSettingsManager';import Marketing from '${root}/src/components/admin/AdminMarketingView';import Shell from '${root}/src/components/admin/AdminShell';import Header from '${root}/src/components/layout/HeaderClient';
import Dashboard from '${root}/src/components/admin/AdminDashboardView';import Appointments from '${root}/src/components/admin/AdminAppointmentsView';import Calendar from '${root}/src/components/admin/AdminAvailabilityCalendar';import Customers from '${root}/src/components/admin/AdminCustomersView';import Overview from '${root}/src/components/admin/finance/FinanceOverview';import Reports from '${root}/src/components/admin/FinancialReportsPanel';import Transactions from '${root}/src/components/admin/finance/FinanceTransactions';import Receipts from '${root}/src/components/admin/finance/FinanceReceipts';import Sales from '${root}/src/components/admin/finance/SalesManager';import Register from '${root}/src/components/admin/finance/RegisterManager';import Settings from '${root}/src/components/admin/AdminSettingsView';import Recurring from '${root}/src/components/recurring-bookings/RecurringBookingManager';import Hours from '${root}/src/components/admin/BusinessHoursManager';import History from '${root}/src/components/admin/AdminEmailHistoryView';import {calculateFinanceComparison} from '${root}/src/lib/finance/comparison';
import {homepageContentDefinitions} from '${root}/src/lib/homepage-content-defaults';import {DEFAULT_CONTACT_SECTION_SETTINGS} from '${root}/src/lib/contact-section/types';
const id='00000000-0000-4000-8000-000000000001';const common={id,is_active:true,sort_order:1,created_at:'2026-01-01',updated_at:'2026-01-01'};
const fields=homepageContentDefinitions.map((f,i)=>({...f,id,contentKey:f.contentKey,label:f.label,value:i===0?'English hero':f.defaultValue,valueDe:i===0?'Deutscher Hero':'',localized:true,sortOrder:f.sortOrder}));
const service={...common,name:'English service',name_de:'Deutsche Leistung',price:40,duration_min:30,duration_max:null,image_url:null};
const template={...common,name:'English template',name_de:'Deutsche Vorlage',description:'Description',description_de:'Beschreibung',default_subject:'English subject',default_subject_de:'Deutscher Betreff',default_headline:'Headline',default_headline_de:'Titel',default_content:'Hello {{first_name}}',default_content_de:'Hallo {{first_name}}',default_cta_text:'Book',default_cta_text_de:'Buchen',default_cta_url:'https://example.invalid',default_preheader:null};
const hours=Array.from({length:7},(_,i)=>({id:String(i),day_of_week:i+1,is_closed:i===6,open_time:'09:00',close_time:'18:00'}));
const customers=['registered','guest'].map((type,i)=>({...common,id:id.slice(0,-1)+(i+2),type,full_name:i?'Original Guest':'Original Registered',email:'synthetic'+i+'@example.invalid',phone:'',notes:'Original authored notes',marketing_email_consent:false,marketing_email_consented_at:null,marketing_email_consent_source:null,marketing_email_unsubscribed_at:null,total_appointments:0,upcoming_appointment:null,last_appointment:null,appointment_history:[]}));
const comparison=calculateFinanceComparison({range:'year',now:new Date('2026-11-22T12:00:00Z'),transactions:[],appointments:[]});comparison.current.series[0].revenue=40;comparison.current.series[0].appointments=1;
const settings={
  business: {
    businessName: "1200 Hairstudio",
    addressLine: "Schulstrasse 2",
    postalCode: "8599",
    city: "Salmsach",
    region: "Thurgau",
    country: "Switzerland",
    phone: "",
    email: "",
    website: "",
    timezone: "Europe/Zurich",
    currency: "CHF",
  },
  booking: {
    slotIntervalMinutes: 30,
    minimumNoticeHours: 2,
    maximumHorizonDays: 90,
    allowGuestBookings: true,
    allowCustomerReschedule: true,
    allowCustomerCancel: true,
    cancellationCutoffHours: 24,
  },
  notifications: {
    bookingConfirmationEmail: true,
    rescheduleEmail: true,
    cancellationEmail: true,
    receiptEmailEnabled: true,
    adminBookingNotification: false,
    senderName: "1200 Hairstudio",
  },
  finance: {
    currency: "CHF",
    defaultReportGrouping: "month",
    autoGenerateReceipt: false,
    enabledPaymentMethods: ["cash", "twint", "card"],
  },
};
function App(){const [view,setView]=useState('week');const [locale,setLocale]=useState('de'),[editor,setEditor]=useState('homepage');window.__locale=locale;window.__fixturePath='/admin/'+editor;window.__authLink={label:'ADMIN DASHBOARD',href:'/admin'};return <NextIntlClientProvider locale={locale} messages={locale==='de'?de:en} timeZone='Europe/Zurich'><AdminContentLocaleProvider><div id='test-controls' style={{display:'flex',flexWrap:'wrap',gap:8}}>{['de','en'].map(l=><button key={l} onClick={()=>setLocale(l)} data-ui={l}>UI {l}</button>)}{['homepage','services','work','announcements','contact','marketing','shell','header','dashboard','appointments','calendar','customers','overview','reports','transactions','receipts','sales','register','settings','recurring','hours','history'].map(e=><button key={e} data-editor={e} onClick={()=>setEditor(e)}>{e}</button>)}{['week','day','list'].map(v=><button key={v} data-view={v} onClick={()=>setView(v)}>{v}</button>)}</div><div id='fixture' className='admin-theme p-5' data-ui={locale}><ContentEditor>{editor==='homepage'?<Homepage configured fields={fields}/>:editor==='services'?<Services initialServices={[service]}/>:editor==='work'?<Work initialItems={[{...common,title:'English work',title_de:'Deutsche Arbeit',image_url:'https://example.invalid/image.webp'}]}/>:editor==='announcements'?<Announcements announcements={[{...common,title:'English announcement',title_de:'Deutsche Meldung',message:'English message',message_de:'Deutsche Nachricht',display_type:'top_bar',cta_text:'Book',cta_text_de:'Buchen',cta_url:'/book',starts_at:null,expires_at:null,is_dismissible:true,priority:0}]}/>:editor==='contact'?<Contact initialSettings={{...DEFAULT_CONTACT_SECTION_SETTINGS,id,instagramEnabled:false,googleReviewsEnabled:false,title:'English contact',german:{title:'Deutscher Kontakt',eyebrow:'Kontakt'}}}/>:editor==='marketing'?<Marketing templates={[template]} campaigns={[]} subscribers={0} campaignsSent={0} emailsSent={0} activeServices={[]} services={[]} promotions={[]} customers={[]}/>:editor==='dashboard'?<Dashboard today='2026-11-22' now='2026-11-22T12:00:00Z' todayAppointments={[]} tomorrowAppointments={[]} availableSlots={[]} availabilityService={null} todayComparison={comparison} monthComparison={comparison} sevenDayComparison={comparison} thirtyDayComparison={comparison} finance={{transactions:[],appointments:[],receipts:[]}} register={null}/>:editor==='appointments'?<Appointments view={view} selectedDate='2026-11-23' todayDateKey='2026-11-22' appointments={[]} businessHours={hours} exceptions={[]} customers={customers} services={[service]} financeSummaries={[]} promotions={[]} receipts={[]} enabledPaymentMethods={['cash']} recurringBookings={[]} sales={[]}/>:editor==='calendar'?<Calendar initialBusinessHours={hours} initialExceptions={[]} appointments={[]} transactions={[]} services={[service]}/>:editor==='customers'?<Customers customers={customers} activeServices={[service]} recurringBookings={[]} loyaltySummaries={{}} todayIso='2026-11-22T12:00:00Z'/>:editor==='overview'?<Overview initialComparison={comparison}/>:editor==='reports'?<Reports reports={[]} defaultGrouping='month'/>:editor==='transactions'?<Transactions transactions={[]} services={[service]}/>:editor==='receipts'?<Receipts receipts={[]}/>:editor==='sales'?<Sales sales={[]} enabledPaymentMethods={['cash']}/>:editor==='register'?<Register data={{current:null,history:[]}}/>:editor==='settings'?<Settings initialSettings={settings} initialReminderSettings={{id:null,enabled:false,hoursBefore:2,emailEnabled:true,whatsappEnabled:false}} adminEmail='synthetic@example.invalid' gmailConnected={false}/>:editor==='recurring'?<Recurring mode='admin' services={[service]} customers={customers} series={[]}/>:editor==='hours'?<Hours initialHours={hours}/>:editor==='history'?<History rows={[]} total={0} page={1} pageSize={20} filters={{search:'',customerId:'',type:'all',status:'all'}}/>:editor==='shell'?<Shell><p>Content</p></Shell>:<Header authLink={window.__authLink}/>}</ContentEditor></div></AdminContentLocaleProvider></NextIntlClientProvider>};
window.__calls=[];createRoot(document.getElementById('root')).render(<App/>);
`;
(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), '1200-editor-browser-'));
  let server, browser;
  try {
    const pageHTML = await (await fetch(`${appOrigin}/de/login`)).text();
    const cssURLs = [...pageHTML.matchAll(/href="([^" ]+\.css[^" ]*)"/g)].map(x => x[1].replaceAll('&amp;', '&'));
    assert(cssURLs.length, 'Running app must provide compiled site CSS');
    const bodyClass=pageHTML.match(/<body[^>]*class="([^"]*)"/)?.[1]??'';
    const css = (await Promise.all(cssURLs.map(async url => (await fetch(new URL(url, appOrigin))).text()))).join('\n');
    await build({ stdin: { contents: entry, resolveDir: root, loader: 'tsx' }, outfile: path.join(temp, 'bundle.js'), bundle: true, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' }, plugins: [{ name: 'synthetic-actions', setup(b) {
      b.onResolve({ filter: /^@\/app\// }, args => ({ path: args.path, namespace: 'action' }));
      b.onLoad({ filter: /.*/, namespace: 'action' }, args => {
        const source = fs.readFileSync(path.join(root, 'src', args.path.slice(2) + '.ts'), 'utf8');
        const names = [...source.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)].map(x => x[1]);
        return { contents: names.map(name => `export async function ${name}(...args){if('${name}'==='getHomepageHeaderAuthState')return window.__authLink;if('${name}'==='getRecurringWorkingDays')return {error:null,weekdays:[1,2,3,4,5]};if('${name}'==='getAdminRecurringStartSlots'||'${name}'==='getCustomerRecurringStartSlots')return {error:null,dateKey:'2026-11-23',slots:[{time:'10:00',slot_start:'2026-11-23T09:00:00Z'}]};if('${name}'==='getAdminCustomerEmailLogs')return {success:true,rows:[],total:0};window.__calls.push({name:'${name}',args:args.map(a=>a instanceof FormData?Object.fromEntries(a):a)});return window.__fail?{success:false,error:'Synthetic save failure',message:'Synthetic save failure'}:{success:true,error:null,id:'00000000-0000-4000-8000-000000000001',templateId:'00000000-0000-4000-8000-000000000001',message:'Saved'};}`).join('\n'), loader: 'js' };
      });
      b.onResolve({ filter: /^@\/i18n\/(navigation|preferences)$/ }, args => ({ path: args.path, namespace: 'mock' }));
      b.onResolve({ filter: /^next\/(image|link|navigation)$/ }, args => ({ path: args.path, namespace: 'mock' }));
      b.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: args.path.endsWith('preferences') ? 'export async function saveLocalePreference(){return {success:true}}' : `import React from '${root}/node_modules/react/index.js';export function useRouter(){return {refresh(){},push(url){window.__navigation=url},replace(url){window.__navigation=url}}}export function usePathname(){return window.__fixturePath||'/admin/site-settings/services'}export function useLinkStatus(){return {pending:false}}export function useSearchParams(){return new URLSearchParams()}export function Link({children,href,...props}){return React.createElement('a',{...props,href:typeof href==='string'?href:'/'},children)}export default function Image({priority,fill,unoptimized,...props}){return React.createElement('img',props)}`, loader: 'js', resolveDir: root }));
      b.onResolve({ filter: /^@\// }, args => ({ path: ['.ts','.tsx','.js','/index.ts','/index.tsx'].map(ext=>path.join(root,'src',args.path.slice(2)+ext)).find(file=>fs.existsSync(file)) }));
    } }] });
    server = http.createServer(async (req, res) => { if(req.url.startsWith('/_next/static/media/')){const asset=await fetch(new URL(req.url,appOrigin));res.setHeader('Content-Type',asset.headers.get('content-type')||'application/octet-stream');res.end(Buffer.from(await asset.arrayBuffer()));return;} if (req.url === '/bundle.js') { res.setHeader('Content-Type', 'application/javascript');res.end(fs.readFileSync(path.join(temp, 'bundle.js'))); } else if(req.url==='/style.css'){res.setHeader('Content-Type','text/css');res.end(css)} else { res.setHeader('Content-Type', 'text/html');res.end('<!doctype html><html><head><link rel="stylesheet" href="/style.css"></head><body class="'+bodyClass+'"><div id="root"></div><script src="/bundle.js"></script></body></html>'); } });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ executablePath: process.env.CHROME_EXECUTABLE_PATH, headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors=[];page.on('pageerror', e=>{errors.push(e.message);console.error('BROWSER',e.stack||e.message)});
    await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
    await page.goto(origin);const fixture=page.locator('#fixture');
    const select = async editor => page.locator(`[data-editor="${editor}"]`).click();
    const toggle = async locale => fixture.locator('[data-content-language]').getByRole('button',{name:locale.toUpperCase(),exact:true}).click();
    const active = () => fixture.locator('[data-content-language]');
    for(const ui of ['de','en']) {
      await page.locator(`[data-ui="${ui}"]`).first().click();
      for(const editor of ['homepage','services','work','announcements','contact','marketing']) {
        await select(editor);
        if(editor==='services'||editor==='work'||editor==='announcements') await fixture.getByRole('button',{name:/^(Edit|Bearbeiten)$/i}).first().click();
        if(editor==='marketing') {await fixture.getByRole('button',{name:/^(Templates|Vorlagen)$/i}).click();await fixture.getByRole('button',{name:/^(Edit|Bearbeiten)$/i}).first().click();}
        await active().waitFor();await toggle('en');
        const text=fixture.locator('input:not([type=number]):not([type=checkbox])').first();
        await text.fill(`${editor} EN draft`);await toggle('de');if(editor==='homepage')assert.equal(await fixture.locator('textarea').first().inputValue(),'');await text.fill(`${editor} DE draft`);await toggle('en');assert.equal(await text.inputValue(),`${editor} EN draft`);await toggle('de');assert.equal(await text.inputValue(),`${editor} DE draft`);
        assert.equal(await fixture.getAttribute('data-ui'),ui);
        // Synthetic failure must retain both language drafts.
        await page.evaluate(()=>window.__fail=true);
        await fixture.getByRole('button',{name:/^(Save Changes|Änderungen speichern|Save Service|Save Work|Save Selected Work|Save Announcement|Save Contact Settings|Save Template|Dienstleistung speichern|Arbeit speichern|Ausgewählte Arbeit speichern|Ankündigung speichern|Meldung speichern|Kontakteinstellungen speichern|Vorlage speichern)$/i}).last().click();
        await page.waitForTimeout(50);assert.equal(await text.inputValue(),`${editor} DE draft`);
        await page.evaluate(()=>window.__fail=false);await toggle('en');assert.equal(await text.inputValue(),`${editor} EN draft`);
        const before=await page.evaluate(()=>window.__calls.length);
        await fixture.getByRole('button',{name:/^(Save Changes|Änderungen speichern|Save Service|Save Work|Save Selected Work|Save Announcement|Save Contact Settings|Save Template|Dienstleistung speichern|Arbeit speichern|Ausgewählte Arbeit speichern|Ankündigung speichern|Meldung speichern|Kontakteinstellungen speichern|Vorlage speichern)$/i}).last().click();
        await page.waitForFunction(count=>window.__calls.length>count,before);
        const call=await page.evaluate(()=>window.__calls.at(-1));
        assert(call.args.some(arg=>arg==='en'||arg?.contentLocale==='en'),`${editor}: explicit EN save`);
        assert.equal(await text.inputValue(),`${editor} EN draft`);await toggle('de');assert.equal(await text.inputValue(),`${editor} DE draft`);
        if(editor==='services')assert.equal(await fixture.locator('input[type=number]').first().inputValue(),'40');

      }
    }
    for(const ui of ['de','en']){
      await page.locator(`[data-ui="${ui}"]`).first().click();await select('homepage');await select('marketing');
      await fixture.getByRole('button',{name:/^\+?\s*(New Campaign|Neue Kampagne)$/i}).click();
      await fixture.getByRole('button',{name:/English template/}).click();await toggle('en');
      const subject=fixture.locator('input').nth(1);await subject.fill('Campaign EN');await toggle('de');assert.equal(await subject.inputValue(),'Deutscher Betreff');await subject.fill('Kampagne DE');await toggle('en');assert.equal(await subject.inputValue(),'Campaign EN');
      assert.equal(await fixture.locator('input').first().inputValue(),'English template');
    }
    console.log('PASS campaign composer uses the shared toggle, preserves both drafts and shared identity');
    await select('homepage');await toggle('en');
    const hero=fixture.locator('input').first();await hero.fill('Changed English');await toggle('de');await hero.fill('Changed German');
    await fixture.getByRole('button',{name:/^(Discard changes|Änderungen verwerfen)$/i}).first().click();assert.equal(await hero.inputValue(),'Deutscher Hero');
    await toggle('en');assert.equal(await hero.inputValue(),'Changed English');await fixture.getByRole('button',{name:/^(Reset to Default|Auf Standard zurücksetzen)$/i}).first().click();assert.equal(await hero.inputValue(),'1200 Barbershop');
    await toggle('de');assert.equal(await hero.inputValue(),'Deutscher Hero');
    // Native segmented buttons support normal Tab/Enter/Space keyboard operation.
    await active().getByRole('button',{name:'EN',exact:true}).focus();await page.keyboard.press('Enter');assert.equal(await active().getAttribute('data-content-language'),'en');
    console.log('PASS reset affects only the selected language, missing German translations stay empty, keyboard activation works');
    console.log('PASS all six editors in all four UI/content combinations; draft switching, successful saves and failed saves retain input');
    await select('homepage');await toggle('en');await page.reload();await active().waitFor();assert.equal(await active().getAttribute('data-content-language'),'en');
    await select('contact');assert.equal(await active().getAttribute('data-content-language'),'en');console.log('PASS content language persists across editor navigation and reload independently of UI locale');
    for(const editor of ['header','shell']) for(const ui of ['de','en']) for(const width of [320,375,430,768,1024,1280,1440,1920]){
      await page.setViewportSize({width,height:1000});await page.locator(`[data-ui="${ui}"]`).first().click();await select(editor);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${editor} ${ui} ${width} overflow`);
      const nav=fixture.locator('header nav').first();
      if(editor==='header'&&width>=1280){const boxes=await fixture.locator('header > div').first().locator(':scope > *:visible').evaluateAll(nodes=>nodes.map(n=>{const b=n.getBoundingClientRect();return {left:b.left,right:b.right}}));for(let i=1;i<boxes.length;i++)assert(boxes[i].left>=boxes[i-1].right-1,`${ui} ${width} header collision`);}
      if(editor==='header'&&width<1280){await fixture.locator('button[aria-controls="mobile-navigation"]').click();assert(await fixture.locator('#mobile-navigation').isVisible());await fixture.locator('button[aria-controls="mobile-navigation"]').click();}
      if(editor==='shell'&&width<1024){await fixture.locator('button[aria-controls="admin-mobile-menu"]').click();assert(await fixture.locator('#admin-mobile-menu').isVisible());await page.keyboard.press('Escape');}
    }
    if(process.env.I18N_AUDIT_BROWSER==='1'){
      for(const ui of ['de','en']){
        await page.locator(`[data-ui="${ui}"]`).first().click();
        for(const editor of ['dashboard','appointments','calendar','customers','overview','reports','transactions','receipts','sales','register','settings','recurring','hours','history']){
          await select(editor);await page.waitForTimeout(40);
          if(ui==='de'){
            const text=await fixture.innerText();
            const forbidden=/\b(?:WEEK RANGE|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY|TOTAL CUSTOMERS|NEW THIS MONTH|SET UP REGULAR BOOKING|Paid amount per paid appointment|Current and previous net revenue|Current-period completed payments|Completed appointments in the current period)\b/i;
            assert(!forbidden.test(text),editor+': English static labels remain: '+text.match(forbidden)?.[0]);
          }
          for(const width of [375,768,1024,1280,1440]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${editor} ${ui} ${width} overflow`);}
          if(editor==='appointments'){
            for(const view of ['week','day','list']){await page.locator(`[data-view="${view}"]`).click();assert((await fixture.innerText()).includes(ui==='de'?({week:'WOCHENZEITRAUM',day:'AUSGEWÄHLTER TAG',list:'LISTENZEITRAUM'}[view]):({week:'WEEK RANGE',day:'SELECTED DAY',list:'LIST RANGE'}[view])));}
          }
          if(editor==='customers'){
            const rows=fixture.locator('button').filter({hasText:'Original Registered'});if(await rows.count())await rows.first().click();if(ui==='de'){const badges=await fixture.locator('span').allTextContents();assert(!badges.some(text=>['registered','guest','prospect','not subscribed'].includes(text.trim().toLowerCase())), 'Customer badges must be localized');}
          }
          if(editor==='recurring')await fixture.getByRole('button',{name:ui==='de'?'Dauertermin einrichten':'Set Up Regular Booking',exact:true}).click();
          if(process.env.ADMIN_SCREENSHOT_DIR&&['appointments','customers','overview','hours'].includes(editor)){await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:path.join(process.env.ADMIN_SCREENSHOT_DIR,`${editor}-${ui}.png`),fullPage:true});}
          if(editor==='customers')await page.keyboard.press('Escape');
        }
      }
      console.log('PASS audit browser: calendar week/day/list, availability, customers, finance modules, reports, settings, recurring setup, business hours and email history; both locales and five requested widths');
    }
    assert.deepEqual(errors,[]);console.log('PASS public header (admin signed in) and admin shell in DE/EN at all eight requested widths; menus work, no page overflow or header collisions');
    if(process.env.ADMIN_SCREENSHOT_DIR){fs.mkdirSync(process.env.ADMIN_SCREENSHOT_DIR,{recursive:true});await page.setViewportSize({width:390,height:844});await select('homepage');await page.locator('[data-ui=de]').first().click();await page.screenshot({path:path.join(process.env.ADMIN_SCREENSHOT_DIR,'homepage-mobile.png'),fullPage:true});await page.setViewportSize({width:1440,height:1000});await select('contact');await page.screenshot({path:path.join(process.env.ADMIN_SCREENSHOT_DIR,'contact-desktop.png'),fullPage:true});}
  } finally { if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));fs.rmSync(temp,{recursive:true,force:true}); }
})().catch(error=>{console.error(error.stack||error.message);process.exitCode=1});
