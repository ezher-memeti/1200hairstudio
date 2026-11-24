// Lightweight, read-only consistency gate. No credentials, network or database access.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { parse } = require('@formatjs/icu-messageformat-parser');
const root = path.resolve(__dirname, '..');
const issues = [], warnings = [];
const dictionaries = {};
function flatten(value, prefix = '', output = {}) {
  for (const [key, child] of Object.entries(value)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (typeof child === 'string') output[full] = child;
    else if (child && typeof child === 'object' && !Array.isArray(child)) flatten(child, full, output);
    else issues.push(`${full}: messages must be strings or namespaces`);
  }
  return output;
}
function duplicates(file) {
  const ast = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JSON);
  function walk(node) {
    if (ts.isObjectLiteralExpression(node)) {
      const seen = new Set();
      for (const property of node.properties) {
        const key = property.name?.text;
        if (seen.has(key)) issues.push(`${file}: duplicate JSON key ${key}`);
        seen.add(key);
      }
    }
    ts.forEachChild(node, walk);
  }
  walk(ast);
}
function placeholders(message, key) {
  const types = new Map();
  try {
    const visit = nodes => nodes.forEach(node => {
      if ([1, 2, 3, 4, 5, 6, 8].includes(node.type)) {
        const previous = types.get(node.value);
        // An argument may appear both as a plural selector and a value.
        types.set(node.value, previous === undefined ? node.type : Math.max(previous, node.type));
      }
      if (node.options) Object.values(node.options).forEach(option => visit(option.value));
      if (node.children) visit(node.children);
    });
    visit(parse(message));
  } catch (error) { issues.push(`${key}: invalid ICU: ${error.message}`); }
  return [...types].sort().map(([name, type]) => `${name}:${type}`).join('|');
}
for (const locale of ['en', 'de']) {
  const file = path.join(root, 'messages', `${locale}.json`);
  duplicates(file); dictionaries[locale] = flatten(JSON.parse(fs.readFileSync(file, 'utf8')));
}
for (const key of new Set([...Object.keys(dictionaries.en), ...Object.keys(dictionaries.de)])) {
  for (const locale of ['en', 'de']) if (!(key in dictionaries[locale]) || !dictionaries[locale][key].trim()) issues.push(`${locale}: missing/empty ${key}`);
  if (key in dictionaries.en && key in dictionaries.de && placeholders(dictionaries.en[key], `en.${key}`) !== placeholders(dictionaries.de[key], `de.${key}`)) issues.push(`${key}: incompatible interpolation variables/types`);
  if (dictionaries.de[key]?.includes('ß')) issues.push(`de.${key}: use Swiss-standard ss`);
}
function files(directory) { return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(path.join(directory, entry.name)) : /\.[cm]?[jt]sx?$/.test(entry.name) ? [path.join(directory, entry.name)] : []); }
const sources = files(path.join(root, 'src'));
const known = new Set(Object.values(dictionaries.en).map(value => value.toLowerCase()));
const allowed = /^(?:&nbsp;→$|Deutsch \/ English$|1200|©|Schulstrasse|8599|Instagram(?: URL)?$|WhatsApp$|Google Maps$|PDF$|CSV$|CHF$|\(CHF\)$|−CHF$|min\s*•|· Europe\/Zurich$|\[PLACEHOLDER\]$|https?:|[\s\d\W]+$)/;
let literals = 0;
for (const file of sources) {
  const ast = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const add = (node, message) => issues.push(`${path.relative(root, file)}:${ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1}: ${message}`);
  const bindings = new Map();
  function collect(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && (ts.isCallExpression(node.initializer) || ts.isAwaitExpression(node.initializer))) {
      const call = ts.isAwaitExpression(node.initializer) ? node.initializer.expression : node.initializer;
      if (ts.isCallExpression(call) && /^(useTranslations|getTranslations)$/.test(call.expression.getText(ast)) && call.arguments[0] && ts.isStringLiteral(call.arguments[0])) {
        const namespaces = bindings.get(node.name.text) || new Set();namespaces.add(call.arguments[0].text);bindings.set(node.name.text, namespaces);
      }
    }
    ts.forEachChild(node, collect);
  }
  collect(ast);
  function walk(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && bindings.has(node.expression.text) && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
      const key = node.arguments[0].text;
      if (![...bindings.get(node.expression.text)].some(namespace => `${namespace}.${key}` in dictionaries.en)) add(node, `unknown translated key: ${node.expression.text}("${key}")`);
    }
    if (ts.isJsxText(node)) {
      const text = node.text.replace(/\s+/g, ' ').trim();
      if (/[A-Za-z]{2}/.test(text) && !allowed.test(text)) add(node, `hardcoded JSX text: ${text}`);
    }
    if (ts.isCallExpression(node) && /^(?:uiText|displayText|interfaceText|textFor)$/.test(node.expression.getText(ast))) {
      const argument = node.arguments[node.expression.getText(ast).endsWith('Text') && ['interfaceText','textFor'].includes(node.expression.getText(ast)) ? 1 : node.expression.getText(ast) === 'textFor' ? 1 : 0];
      function checkLiteral(expression) {
        if (!expression) return;
        if (ts.isStringLiteral(expression)) {
          literals++;
          if (/[A-Za-z]{2}/.test(expression.text) && !known.has(expression.text.toLowerCase()) && !allowed.test(expression.text)) add(expression, `uncatalogued display literal: ${expression.text}`);
        } else if (ts.isConditionalExpression(expression)) {
          checkLiteral(expression.whenTrue);checkLiteral(expression.whenFalse);
        } else if (ts.isBinaryExpression(expression) && [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(expression.operatorToken.kind)) {
          checkLiteral(expression.left);checkLiteral(expression.right);
        }
      }
      checkLiteral(argument);
    }
    ts.forEachChild(node, walk);
  }
  walk(ast);
}
const allSource = sources.map(file => fs.readFileSync(file, 'utf8')).join('\n');
for (const namespace of new Set(Object.keys(dictionaries.en).map(key => key.split('.')[0]))) {
  // ui/labels are intentionally accessed through the legacy source-text adapter.
  if (['ui','labels'].includes(namespace)) continue;
  if (!allSource.includes(`"${namespace}"`) && !allSource.includes(`.${namespace}`)) warnings.push(`Namespace ${namespace} has no detectable source reference`);
}
for (const key of Object.keys(JSON.parse(fs.readFileSync(path.join(root, "messages/en.json"), "utf8")).audit ?? {})) {
  if (!allSource.includes(`"${key}"`) && !allSource.includes(`'${key}'`)) console.log(`WARN audit.${key}: no literal source reference; review whether this key is unused`);
}
const duplicateValues = new Map();
for (const [key, value] of Object.entries(dictionaries.en)) { const keys = duplicateValues.get(value) || [];keys.push(key);duplicateValues.set(value, keys); }
const duplicateGroups = [...duplicateValues.values()].filter(keys => keys.length > 1);
console.log(`Audited ${sources.length} source files, ${Object.keys(dictionaries.en).length} messages per locale and ${literals} literal display lookups.`);
console.log(`INFO ${duplicateGroups.length} repeated English values across keys/namespaces; existing keys are retained for compatibility.`);
for (const warning of warnings) console.log(`WARN ${warning}`);
if (process.argv.includes('--details')) for (const group of duplicateGroups) console.log(`INFO repeated value: ${group.join(', ')}`);
if (issues.length) { issues.forEach(issue => console.error(`FAIL ${issue}`));process.exitCode = 1; }
else console.log('PASS recursive key parity, nonempty translations, ICU placeholders, duplicate-key detection, Swiss spelling and practical JSX/display-literal scan.');
