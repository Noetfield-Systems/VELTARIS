import {readdir, readFile} from 'node:fs/promises';
import {neon} from '@neondatabase/serverless';

const url = process.env.VELTARIS_MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
if (!url) throw new Error('Set an authorized VELTARIS owner connection to run migrations.');
const sql = neon(url);
const directory = new URL('../db/', import.meta.url);
for (const filename of (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort()) {
  const migration = await readFile(new URL(filename, directory), 'utf8');
  const statements = migration.split(/^-- statement\s*$/m).map((statement) => statement.trim()).filter(Boolean);
  await sql.transaction(statements.map((statement) => sql.query(statement)));
  console.log('Applied ' + filename);
}
