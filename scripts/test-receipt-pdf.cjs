const fs = require("node:fs");
const ts = require("typescript");
const pdfLib = require("pdf-lib");

const sourcePath = require.resolve("../src/lib/receipts/server.ts");
const source = fs.readFileSync(sourcePath, "utf8");
const start = source.indexOf("function drawRight");
const endMarker = "  return document.save();\n}";
const end = source.indexOf(endMarker, start) + endMarker.length;

if (start < 0 || end < endMarker.length) throw new Error("Receipt PDF implementation was not found.");

const implementation = source.slice(start, end);
const compiled = ts.transpileModule(
  `const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");\n${implementation}\nexports.generateReceiptPdf = generateReceiptPdf;`,
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;
const moduleExports = {};
const scopedRequire = (name) => {
  if (name === "pdf-lib") return pdfLib;
  throw new Error(`Unexpected module: ${name}`);
};
new Function("require", "exports", compiled)(scopedRequire, moduleExports);

(async () => {
  const bytes = await moduleExports.generateReceiptPdf({
    receipt_number: 1001,
    issued_at: "2026-11-05T12:00:00.000Z",
    appointment_start_at: "2026-11-06T17:30:00.000Z",
    customer_name: "Gate 4 PDF Test",
    service_quantity: 1,
    service_name: "Haircut",
    subtotal: 40,
    discount_label: "Promotion",
    discount_amount: 5,
    tax_amount: 0,
    total: 35,
    tip_amount: 5,
    payment_method: "card",
    amount_paid: 40,
    balance: 0,
    currency: "CHF",
  });
  const parsed = await pdfLib.PDFDocument.load(bytes);
  const header = Buffer.from(bytes).subarray(0, 5).toString("ascii");
  if (header !== "%PDF-" || parsed.getPageCount() !== 1 || bytes.length < 1000) {
    throw new Error(`Invalid PDF: header=${header}, pages=${parsed.getPageCount()}, bytes=${bytes.length}`);
  }
  console.log(JSON.stringify({ header, pages: parsed.getPageCount(), bytes: bytes.length }));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
