import {createHash, randomBytes} from 'node:crypto';

export const COOKIE = '__Host-veltaris-portal';
export const MAX_FILE_SIZE = 2 * 1024 * 1024;
export const LEAD_STAGES = ['New','Qualified','Discovery','Proposal','Closed won','Closed lost'];
export const token = () => randomBytes(32).toString('base64url');
export const isToken = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
export const digest = (value) => createHash('sha256').update(value).digest('hex');
export const isId = (value) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export function sessionKey(cookies) {
  const raw = cookies?.split(';').map((part) => part.trim()).find((part) => part.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
  return isToken(raw) ? digest(raw) : null;
}

export function cookie(value, hours = 12) {
  return COOKIE + '=' + value + '; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=' + hours * 3600;
}

export function requiredText(value, limit, label) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > limit) throw new Error(label + ' is missing or too long.');
  return value.trim();
}

export function parseDate(value) {
  if (value === '' || value == null) return null;
  if (typeof value !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(value)) throw new Error('Enter a valid follow-up date.');
  const date = new Date(value + 'T00:00:00Z');
  if (!Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== value) throw new Error('Enter a valid follow-up date.');
  return value;
}

export function documentPayload({name, data}) {
  const filename = requiredText(name, 120, 'File name');
  const ext = filename.split('.').pop().toLowerCase();
  const media = new Map([['pdf','application/pdf'],['csv','text/csv'],['txt','text/plain']]).get(ext);
  if (!media || /[\u0000-\u001f\u007f/\\]/.test(filename)) throw new Error('Choose a PDF, CSV or text file.');
  if (typeof data !== 'string' || data.length > Math.ceil(MAX_FILE_SIZE / 3) * 4
      || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw new Error('Choose a file up to 2 MB.');
  const bytes = Buffer.from(data, 'base64');
  if (bytes.length === 0 || bytes.length > MAX_FILE_SIZE || bytes.toString('base64') !== data)
    throw new Error('Choose a valid file up to 2 MB.');
  if (ext === 'pdf' && bytes.subarray(0, 5).toString() !== '%PDF-') throw new Error('The file does not contain a PDF header.');
  if (ext !== 'pdf') {
    try {
      const text = new TextDecoder('utf-8', {fatal: true}).decode(bytes);
      if (text.includes('\0')) throw new Error();
    } catch {
      throw new Error('CSV and text files must use UTF-8.');
    }
  }
  return {filename, media, data};
}
