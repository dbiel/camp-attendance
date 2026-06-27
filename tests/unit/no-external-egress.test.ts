/**
 * No-External-Egress Guard
 *
 * Enforces the project's hard constraint: the app must NEVER contact anyone
 * outside the organization. The only permitted outbound network call is to the
 * Anthropic API (case parsing), made via the `@anthropic-ai/sdk` (which does
 * not call a literal `fetch()` URL). All parent/dorm messaging is draft-only
 * via `sms:` deep links rendered as plain anchors — never transmitted.
 *
 * This test fails the build if anyone introduces:
 *   - a messaging/email SDK (twilio, sendgrid, nodemailer, smtp, postmark,
 *     mailgun, ses, graph.microsoft, messaging_send), or
 *   - a fetch()/axios() to an absolute external host other than the allowlist.
 *
 * Scans app/ and lib/ source only (NOT tests/ — this file names the very
 * tokens it bans). Relative/no-host fetches (internal API routes) are fine.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOTS = ['app', 'lib'];
const EXTS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs']);

// Hosts the app is allowed to reach with an absolute URL. Keep this tiny.
const ALLOWED_HOSTS = new Set(['api.anthropic.com']);

// Messaging/email libraries or APIs that imply contacting an external party.
const BANNED_TOKENS = [
  'twilio',
  'sendgrid',
  'nodemailer',
  'postmark',
  'mailgun',
  'graph.microsoft',
  'messaging_send',
  // node mailers / smtp
  'createTransport',
  'smtp://',
];

function walk(dir: string): string[] {
  let out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === '.next' || name === '__tests__') continue;
      out = out.concat(walk(full));
    } else if (EXTS.has(extname(name))) {
      out.push(full);
    }
  }
  return out;
}

const FILES = ROOTS.flatMap(walk);

// fetch( "https://host..." )  or  axios( "https://host..." )
const ABS_FETCH_RE = /\b(?:fetch|axios)\s*\(\s*[`'"]\s*(https?:\/\/[^`'"\s)]+)/gi;

describe('no external egress', () => {
  it('scans a non-trivial number of source files', () => {
    // Guard against a glob/path regression silently scanning nothing.
    expect(FILES.length).toBeGreaterThan(20);
  });

  it('contains no banned messaging/email SDKs or APIs', () => {
    const hits: string[] = [];
    for (const file of FILES) {
      const src = readFileSync(file, 'utf8').toLowerCase();
      for (const tok of BANNED_TOKENS) {
        if (src.includes(tok.toLowerCase())) hits.push(`${file}: "${tok}"`);
      }
    }
    expect(hits, `Banned external-contact token(s) found:\n${hits.join('\n')}`).toEqual([]);
  });

  it('makes no fetch/axios call to a non-allowlisted external host', () => {
    const violations: string[] = [];
    for (const file of FILES) {
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(ABS_FETCH_RE)) {
        const url = m[1];
        let host = '';
        try {
          host = new URL(url).host;
        } catch {
          host = url;
        }
        if (!ALLOWED_HOSTS.has(host)) {
          violations.push(`${file}: fetch/axios -> ${host}`);
        }
      }
    }
    expect(
      violations,
      `Outbound call to a non-allowlisted host (allowed: ${[...ALLOWED_HOSTS].join(', ')}):\n${violations.join('\n')}`
    ).toEqual([]);
  });
});
