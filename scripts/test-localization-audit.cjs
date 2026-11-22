const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function load(file) {
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('require', 'module', 'exports', source)(name => {
    if (name === 'server-only') return {};
    if (name === 'react') return { ...require('react'), cache: fn => fn };
    if (name === '@/lib/auth/customer') return { requireAdminUser() { throw new Error('Live authorization unavailable in synthetic test'); } };
    if (name.endsWith('.json')) return require(path.resolve(root, path.dirname(file), name));
    if (name.startsWith('@/') || name.startsWith('.')) {
      const base = name.startsWith('@/') ? 'src/' + name.slice(2) : path.join(path.dirname(file), name);
      const target = [base + '.ts', base + '.tsx', base + '/index.ts'].find(candidate => fs.existsSync(path.join(root, candidate)));
      if (!target) throw new Error(`Unresolved test import ${name}`);
      return load(target);
    }
    return require(name);
  }, module, module.exports);
  return module.exports;
}
async function pdfText(bytes) {
  const { PDFDocument, PDFRawStream } = require('pdf-lib');
  const document = await PDFDocument.load(bytes);
  let text = '';
  for (const [, object] of document.context.enumerateIndirectObjects()) if (object instanceof PDFRawStream) {
    let data;
    try { data = zlib.inflateSync(object.getContents()).toString('latin1'); } catch { continue; }
    for (const match of data.matchAll(/<([A-Fa-f0-9]+)>\s*Tj/g)) text += Buffer.from(match[1], 'hex').toString('latin1') + '\n';
  }
  return text;
}
let count = 0;
async function test(name, action) { await action();count++;console.log('PASS ' + name); }
(async () => {
  const { textFor } = load('src/i18n/text.ts');
  const { weekdayLabels, monthLabel, reportRowLabel } = load('src/i18n/format.ts');
  await test('Reported calendar, customer, recurring and finance labels translate in all display cases', () => {
    const values = { Week: 'Woche', Day: 'Tag', List: 'Liste', 'Week Range': 'Wochenzeitraum', 'Total Customers': 'Kunden insgesamt', 'New This Month': 'Neu diesen Monat', Guest: 'Gast', Registered: 'Registriert', Prospect: 'Interessent', 'Set Up Regular Booking': 'Dauertermin einrichten', 'Paid amount per paid appointment': 'Bezahlter Betrag pro bezahltem Termin', 'Current-period completed payments': 'Abgeschlossene Zahlungen im aktuellen Zeitraum' };
    for (const [en, de] of Object.entries(values)) { assert.equal(textFor('de', en), de);assert.equal(textFor('de', en.toUpperCase()), de.toLocaleUpperCase('de-CH'));assert.equal(textFor('en', en), en); }
    assert.equal(textFor('de', 'Original authored customer text'), 'Original authored customer text');
  });
  await test('Weekdays/months/report periods use Intl; date keys and Zurich DST behavior remain unchanged', () => {
    assert.equal(weekdayLabels('de')[0], 'Montag');assert.equal(weekdayLabels('en')[6], 'Sunday');
    assert.equal(monthLabel(2, 'de'), 'März');assert.equal(monthLabel(2, 'en'), 'March');
    assert(reportRowLabel('2026-03', 'Old German snapshot label', 'en').includes('March'));
    const { formatDateKey, getZurichDateKeyFromIso } = load('src/lib/appointments/date-utils.ts');
    assert(formatDateKey('2026-03-29', { weekday: 'long' }, 'de').includes('Sonntag'));
    assert.equal(getZurichDateKeyFromIso('2026-03-28T23:30:00Z'), '2026-03-29');
    assert.equal(getZurichDateKeyFromIso('2026-10-24T22:30:00Z'), '2026-10-25');
  });
  await test('Dynamic feedback and plural messages retain interpolation safely', () => {
    assert.equal(textFor('de', 'Campaign complete: 2 sent, 1 failed, 3 skipped.'), 'Kampagne abgeschlossen: 2 gesendet, 1 fehlgeschlagen, 3 übersprungen.');
    const { createTranslator } = require('next-intl');
    const t = createTranslator({ locale: 'de', messages: require('../messages/de.json').audit });
    assert.equal(t('appointmentCount', { count: 1 }), '1 Termin');assert.equal(t('appointmentCount', { count: 2 }), '2 Termine');
    assert(t('protectedSummary', { count: 1 }).includes('Er wird storniert'));assert(t('protectedSummary', { count: 2 }).includes('Sie werden storniert'));
  });
  await test('Unprefixed export endpoints validate explicit display locales and retain safe cookie defaults', () => {
    const { requestLocale } = load('src/i18n/http.ts');
    assert.equal(requestLocale(new Request('https://example.invalid/api/export?locale=en', { headers: { cookie: '1200_locale=de' } })), 'en');
    assert.equal(requestLocale(new Request('https://example.invalid/api/export?locale=fr', { headers: { cookie: '1200_locale=en' } })), 'en');
    assert.equal(requestLocale(new Request('https://example.invalid/api/export?locale=fr')), 'de');
  });
  await test('Financial CSV/PDF exports translate captions without mutating snapshots or amounts', async () => {
    const reports = load('src/lib/finance/reports.ts');
    const { FINANCIAL_REPORT_SECTIONS } = load('src/lib/finance/report-types.ts');
    const totals = Object.fromEntries(FINANCIAL_REPORT_SECTIONS.flatMap(section => section.columns).map(column => [column.key, 40]));
    const report = { id: 'synthetic-report', report_number: 'SYNTHETIC-001', period_type: 'monthly', period_start: '2026-03-01', period_end: '2026-03-31', group_by: 'month', currency: 'CHF', generated_at: '2026-03-31T12:00:00Z', snapshot: { version: 2, businessName: '1200 Hairstudio', address: ['Synthetic address', 'Synthetic town'], periodType: 'monthly', periodStartDate: '2026-03-01', periodEndDate: '2026-03-31', groupBy: 'month', currency: 'CHF', totals, rows: [{ ...totals, key: '2026-03', label: 'März 2026' }] } };
    const original = JSON.stringify(report);
    const english = reports.generateFinancialReportCsv(report, 'en'), german = reports.generateFinancialReportCsv(report, 'de');
    assert(english.includes('Gross revenue'));assert(!english.includes('Bruttoumsatz'));assert(german.includes('Bruttoumsatz'));
    assert.equal(english.split('\n').at(-1), german.split('\n').at(-1));
    const enPDF = await pdfText(await reports.generateFinancialReportPdf(report, 'en'));
    const dePDF = await pdfText(await reports.generateFinancialReportPdf(report, 'de'));
    assert(enPDF.includes('SALES'));assert(!enPDF.includes('UMSATZ'));assert(dePDF.includes('UMSATZ'));assert(dePDF.includes('Bruttoumsatz'));
    assert.equal(JSON.stringify(report), original);
  });
  await test('Customer export captions translate while original names, notes and IDs remain unchanged', async () => {
    const exports = load('src/lib/customers/exports.ts');
    const customer = { id: 'synthetic-customer', full_name: 'New', email: 'synthetic@example.invalid', phone: '', type: 'registered', created_at: '2026-01-01T12:00:00Z', notes: 'Original authored customer note', appointment_history: [], marketing_email_consent: false, marketing_email_consented_at: null, marketing_email_unsubscribed_at: null };
    const original = JSON.stringify(customer);
    const en = exports.createCustomerCsv(customer, new Date('2026-11-22'), 'en');
    const de = exports.createCustomerCsv(customer, new Date('2026-11-22'), 'de');
    assert(en.includes('Total Bookings'));assert(de.includes('Buchungen insgesamt'));assert(en.includes('"New"'));assert(de.includes('"New"'));
    const text = await pdfText(await exports.createCustomerPdf(customer, new Date('2026-11-22'), 'de'));
    assert(text.includes('NEW'));assert(!text.includes('\nNEU\n'));assert(text.includes('Original authored customer note'));
    assert.equal(JSON.stringify(customer), original);
  });
  await test('Register report exports translate only captions, preserving entered notes and cash amounts', async () => {
    const reports = load('src/lib/register/report.ts');
    const detail = { session: { id: 'synthetic-register', opened_at: '2026-11-22T08:00:00Z', closed_at: '2026-11-22T18:00:00Z', actual_cash: 40, difference: 0, closing_note: 'Original authored note' }, openedByLabel: 'Original Admin', closedByLabel: 'Original Admin', expectedCash: 40, breakdown: { openingCash: 40, paymentMethods: [], deposits: 0, withdrawals: 0, cashPayments: 0, cashTips: 0, cashRefunds: 0 } };
    const html = reports.registerReportHtml(detail, false, 'de');
    assert(html.includes('KASSENABSCHLUSSBERICHT'));assert(html.includes('Original authored note'));assert(html.includes('CHF 40.00'));
    assert((await pdfText(await reports.generateRegisterClosingPdf(detail, 'de'))).includes('KASSENABSCHLUSSBERICHT'));
  });
  await test('Translation validator rejects missing keys, invalid placeholders, duplicate keys and uncatalogued UI', () => {
    const os = require('node:os'), { spawnSync } = require('node:child_process');
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), '1200-translation-validator-'));
    try {
      fs.mkdirSync(path.join(temp, 'scripts'));fs.mkdirSync(path.join(temp, 'messages'));fs.mkdirSync(path.join(temp, 'src'));
      fs.copyFileSync(path.join(root, 'scripts/validate-translations.cjs'), path.join(temp, 'scripts/validate-translations.cjs'));
      fs.symlinkSync(path.join(root, 'node_modules'), path.join(temp, 'node_modules'));
      const write = (de, source = 'export const value = 1;') => { fs.writeFileSync(path.join(temp, 'messages/en.json'), '{"audit":{"message":"Hello {name}"}}');fs.writeFileSync(path.join(temp, 'messages/de.json'), de);fs.writeFileSync(path.join(temp, 'src/fixture.tsx'), source); };
      const run = () => spawnSync(process.execPath, [path.join(temp, 'scripts/validate-translations.cjs')], { encoding: 'utf8' });
      write('{"audit":{"message":"Hallo {name}"}}');assert.equal(run().status, 0);
      for (const [de, source] of [
        ['{"audit":{}}'],
        ['{"audit":{"message":"Hallo {count}"}}'],
        ['{"audit":{"message":"Hallo {name}","message":"Hallo {name}"}}'],
        ['{"audit":{"message":"Hallo {name}"}}', 'export function Fixture(){return <p>Untranslated static text</p>}'],
        ['{"audit":{"message":"Hallo {name}"}}', 'const ui=useTranslations("audit");ui("missing");'],
      ]) { write(de, source);assert.equal(run().status, 1); }
    } finally { fs.rmSync(temp, { recursive: true, force: true }); }
  });
  console.log(`PASS ${count} localization-audit groups; synthetic data, no network, records or messages.`);
})().catch(error => { console.error(error.stack || error.message);process.exitCode = 1; });
