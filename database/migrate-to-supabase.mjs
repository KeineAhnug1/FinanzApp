#!/usr/bin/env node
/**
 * Non-invasive helper: prints instructions to run the schema on Supabase.
 * Does not change any database state programmatically.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaPath = path.join(__dirname, "supabase-schema.sql");

console.log("Supabase migration helper\n");
console.log("1) Öffne dein Supabase Dashboard");
console.log("2) SQL Editor → New Query");
console.log("3) Datei öffnen:", schemaPath);
console.log("4) Query ausführen\n");
console.log("Hinweis: Dieses Skript ist ein No-Op und verändert nichts direkt.");

