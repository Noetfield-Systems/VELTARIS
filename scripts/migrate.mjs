import {readFile} from 'node:fs/promises';
import {neon} from '@neondatabase/serverless';

const url = process.env.VELTARIS_DATABASE_URL || process.env.DATABASE_URL;
if (!url) throw new Error('Set the dedicated VELTARIS database URL before running the migration.');

const sql = neon(url);
const migration = await readFile(new URL('../db/001_pilot_requests.sql', import.meta.url), 'utf8');
await sql.query(migration);
console.log('Applied pilot_requests migration.');
