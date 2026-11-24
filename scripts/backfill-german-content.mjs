// Run: node --env-file=.env.local scripts/backfill-german-content.mjs [--apply]
// Default is read-only. Review scripts/i18n/content-backfill.json before --apply.
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
const rows = JSON.parse(await readFile(new URL("./i18n/content-backfill.json", import.meta.url), "utf8"));
const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false,autoRefreshToken:false}});
const apply = process.argv.includes("--apply");
let eligible=0, updated=0, skipped=0;
for (const row of rows) {
  const {data,error}=await client.from(row.table).select(`${row.sourceField},${row.column}`).eq(row.keyColumn,row.key).maybeSingle();
  if(error) throw Error(`Cannot inspect ${row.table}; no raw database error logged.`);
  if(!data || data[row.sourceField]!==row.expectedSource || data[row.column]) { skipped++; continue; }
  eligible++;
  if(apply) {
    let query=client.from(row.table).update({[row.column]:row.value}).eq(row.keyColumn,row.key).eq(row.sourceField,row.expectedSource);
    query=data[row.column]===null?query.is(row.column,null):query.eq(row.column,"");
    const {data:changed,error:updateError}=await query.select(row.keyColumn);
    if(updateError)throw Error(`Update failed for ${row.table}; no raw database error logged.`);
    updated+=changed?.length??0;
  }
}
console.log(JSON.stringify({mode:apply?"apply":"dry-run",eligible,updated,skipped}));
