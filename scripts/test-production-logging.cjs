// Synthetic-only logging regressions: no network, credentials or business writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function load(file, mocks = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', code)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name === '@/lib/logging') return load('src/lib/logging.ts');
    return {};
  }, module, module.exports);
  return module.exports;
}
const { safeLogDetails } = load('src/lib/logging.ts');
let passed = 0;
async function test(name, run) { await run(); passed++; console.log('PASS ' + name); }
(async () => {
  const secret = 'synthetic-private-marker';
  const id = '00000000-0000-4000-8000-000000000001';
  await test('SDK/database errors retain codes and correlation, never secrets or personal data', () => {
    const error = Object.assign(new Error(secret), { code: '23505', details: secret, hint: secret, stack: secret, config: { headers: { Authorization: secret }, body: secret }, response: { status: 429, data: secret } });
    const result = safeLogDetails({ error, appointmentId: id, customerId: id, emailLogId: id, providerMessageId: secret, input: { search: secret }, email: secret, notes: secret });
    assert.deepEqual(result, { appointmentId: id, emailLogId: id, error: { code: '23505', httpStatus: 429, kind: 'Error' } });
    assert(!JSON.stringify(result).includes(secret));
    assert.deepEqual(safeLogDetails(error), { code: '23505', httpStatus: 429, kind: 'Error' });
  });
  await test('Invalid codes, identifiers, arbitrary statuses and all raw strings fail closed', () => {
    for (const value of [null, undefined, secret, 1, false]) assert.deepEqual(safeLogDetails(value), {});
    assert.deepEqual(safeLogDetails({ code: secret, status: secret, name: secret, reminderId: secret, message: secret, cause: { code: '23505' } }), {});
    assert.deepEqual(safeLogDetails({ code: 'ECONNRESET', status: 502, channel: 'email', operation: 'update' }), { code: 'ECONNRESET', httpStatus: 502, operation: 'update', channel: 'email' });
    assert.deepEqual(safeLogDetails({ code: 'PGRST116' }), { code: 'PGRST116' });
  });
  await test('Circular objects, hostile getters and nested SDK bodies cannot break error handling', () => {
    const circular = {}; circular.error = circular;
    assert.deepEqual(safeLogDetails(circular), {});
    assert.doesNotThrow(() => safeLogDetails(Object.defineProperty({}, 'code', { get() { throw new Error(secret); } })));
    assert.deepEqual(safeLogDetails({ error: { code: 'invalid_grant', config: secret, response: { status: 401, data: secret } }, deliveryError: new TypeError(secret) }), { error: { code: 'invalid_grant', httpStatus: 401 }, deliveryError: { kind: 'TypeError' } });
  });
  await test('Report endpoint retains error status, logs safely and returns no raw exception', async () => {
    const captured = [], original = console.error;
    console.error = (...args) => captured.push(args);
    try {
      const route = load('src/app/api/admin/financial-reports/temporary/route.ts', {
        '@/i18n/http': { requestLocale: () => 'en' },
        '@/i18n/text': { textFor: (_, value) => value },
        '@/lib/auth/customer': { requireAdminUser: async () => { throw Object.assign(new Error(secret), { code: '23505' }); } },
      });
      const response = await route.GET(new Request('https://example.invalid/api/admin/financial-reports/temporary'));
      assert.equal(response.status, 400);
      assert.equal(await response.text(), 'The temporary report could not be generated.');
      assert.equal(captured.length, 1);
      assert.deepEqual(captured[0], ['TEMPORARY FINANCIAL REPORT EXPORT ERROR', { code: '23505', kind: 'Error' }]);
      assert(!JSON.stringify(captured).includes(secret));
    } finally { console.error = original; }
  });
  await test('Reminder job errors remain observable but never return database details', async () => {
    const captured = [], original = console.error;
    console.error = (...args) => captured.push(args);
    try {
      const db = { from: () => ({ select: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null, error: { code: '42501', message: secret, details: secret } }) }) }) }) };
      let handler;
      const env = { APPOINTMENT_REMINDER_CRON_SECRET: 'synthetic', SUPABASE_URL: 'https://example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'synthetic', REMINDER_DELIVERY_URL: 'https://example.invalid', REMINDER_DELIVERY_SECRET: 'synthetic' };
      const source = ts.transpileModule(fs.readFileSync(path.join(root, 'supabase/functions/process-appointment-reminders/index.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
      new Function('require', 'exports', 'Deno', 'fetch', source)(name => name === '../_shared/logging.ts' ? { safeLogDetails } : { createClient: () => db }, {}, { env: { get: name => env[name] }, serve: fn => { handler = fn; } }, () => { throw new Error('Network access forbidden'); });
      const response = await handler(new Request('https://example.invalid', { headers: { 'x-cron-secret': 'synthetic' } }));
      assert.equal(response.status, 500);
      assert.equal((await response.json()).error, 'Reminder processing failed.');
      assert.deepEqual(captured, [['process-appointment-reminders failed', { code: '42501' }]]);
      assert(!JSON.stringify(captured).includes(secret));
    } finally { console.error = original; }
  });
  await test('Application/worker have no debug consoles or debugger statements; operational errors are sanitized', () => {
    const alreadySafe = new Set(['src/lib/google-reviews/server.ts', 'src/app/api/webhooks/whatsapp/route.ts', 'src/app/api/admin/whatsapp/test/route.ts']);
    let logs = 0;
    function scan(dir) {
      for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) { scan(file); continue; }
        if (!/\.tsx?$/.test(file)) continue;
        const source = ts.createSourceFile(file, fs.readFileSync(path.join(root, file), 'utf8'), ts.ScriptTarget.Latest, true);
        function visit(node) {
          assert(!ts.isDebuggerStatement(node), file + ': debugger statement');
          if (ts.isCallExpression(node) && /^console\./.test(node.expression.getText(source))) {
            const method = node.expression.getText(source);
            const authAudit = file === 'src/lib/auth/form-handler.ts' && method === 'console.info' && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0]) && ['[AUTH] Registration attempt: Account already exists','[AUTH] Password reset: Email is sent','[AUTH] Password reset: Account not found'].includes(node.arguments[0].text);
            assert(authAudit || ['console.error', 'console.warn'].includes(method), file + ': ' + method);
            logs++;
            assert(ts.isStringLiteral(node.arguments[0]), file + ': dynamic log label');
            for (const arg of [...node.arguments].slice(1)) {
              if (!alreadySafe.has(file)) assert(ts.isCallExpression(arg) && arg.expression.getText(source) === 'safeLogDetails', file + ': unsanitized log argument');
              else {
                assert(ts.isObjectLiteralExpression(arg) && arg.properties.length === 1, file + ': provider warning must have one safe field');
                const field = arg.properties[0];
                assert(['code', 'status'].includes(field.name?.getText(source)), file + ': unexpected provider log field');
                assert(ts.isStringLiteral(field.initializer) || ['error.code', 'response.status'].includes(field.initializer.getText(source)), file + ': unexpected provider log value');
              }
            }
          }
          ts.forEachChild(node, visit);
        }
        visit(source);
      }
    }
    scan('src'); scan('supabase/functions');
    assert(logs > 90, 'Operational logs must be preserved');
    assert.equal(fs.readFileSync(path.join(root, 'src/lib/logging.ts'), 'utf8'), fs.readFileSync(path.join(root, 'supabase/functions/_shared/logging.ts'), 'utf8'), 'Next and independently deployed Deno sanitizer contracts must match');
    const worker = fs.readFileSync(path.join(root, 'supabase/functions/process-appointment-reminders/index.ts'), 'utf8');
    assert(worker.includes('error: "Reminder processing failed."'));
    for (const file of ['src/app/api/google/auth/route.ts', 'src/app/api/google/callback/route.ts']) assert(fs.readFileSync(path.join(root, file), 'utf8').includes('process.env.NODE_ENV !== "development"'), 'OAuth diagnostic routes remain development-only');
  });
  console.log(`${passed} production logging groups passed; synthetic data only, no external calls or writes.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
