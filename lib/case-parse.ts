import Anthropic from '@anthropic-ai/sdk';
import type { Student } from './types';
import type { Contact } from './contacts';

export interface ParsedReport {
  /** Roster ids of candidate students, best match first (max 3). Empty = no match. */
  student_ids: string[];
  /** The raw name string the reporter used, for display when no match. */
  student_query: string | null;
  reporter_contact_id: string | null;
  reporter_name: string | null;
  reporter_phone: string | null;
  summary: string;
  session_label: string | null;
}

const PARSE_SCHEMA = {
  type: 'object',
  properties: {
    student_ids: { type: 'array', items: { type: 'string' } },
    student_query: { type: ['string', 'null'] },
    reporter_contact_id: { type: ['string', 'null'] },
    reporter_name: { type: ['string', 'null'] },
    reporter_phone: { type: ['string', 'null'] },
    summary: { type: 'string' },
    session_label: { type: ['string', 'null'] },
  },
  required: [
    'student_ids', 'student_query', 'reporter_contact_id',
    'reporter_name', 'reporter_phone', 'summary', 'session_label',
  ],
  additionalProperties: false,
} as const;

const INSTRUCTIONS = `You parse incident reports texted to a band-camp director about campers missing from class.
Given a pasted text message, identify:
- student_ids: ids from the roster below matching the kid mentioned. Names may be misspelled or use nicknames — fuzzy match. Best match first, up to 3 candidates. Empty array if nothing plausibly matches.
- student_query: the name string as written in the message (null if no kid is named).
- reporter_contact_id: the id from the contact list if the sender is identifiable by name or phone number; otherwise null.
- reporter_name / reporter_phone: name or phone of the sender if present in the text but NOT in the contact list; otherwise null.
- summary: one short sentence describing what happened.
- session_label: where/when the kid was missed, as stated (e.g. "Trumpet sectional, period 3"); null if not stated.
Return only data supported by the message — never invent.`;

function rosterBlock(students: Student[]): string {
  const lines = students.map((s) =>
    `${s.id}\t${s.first_name} ${s.last_name}${s.preferred_name ? ` (goes by ${s.preferred_name})` : ''}\t${s.instrument}\t${s.ensemble ?? '?'}\t${s.dorm_building ?? 'commuter'}`
  );
  return `ROSTER (id, name, instrument, ensemble, dorm):\n${lines.join('\n')}`;
}

function contactsBlock(contacts: Contact[]): string {
  const lines = contacts.map((c) => `${c.id}\t${c.name}\t${c.phone}\t${c.role}`);
  return `KNOWN CONTACTS (id, name, phone, role):\n${lines.join('\n')}`;
}

export async function parseReport(
  rawText: string,
  students: Student[],
  contacts: Contact[]
): Promise<ParsedReport | null> {
  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: process.env.CASE_PARSE_MODEL || 'claude-opus-4-8',
      max_tokens: 2048,
      // Roster and contacts get separate cache breakpoints: contact additions
      // (learn-as-you-go) must not invalidate the large cached roster prefix.
      system: [
        { type: 'text', text: INSTRUCTIONS },
        { type: 'text', text: rosterBlock(students), cache_control: { type: 'ephemeral' } },
        { type: 'text', text: contactsBlock(contacts), cache_control: { type: 'ephemeral' } },
      ],
      output_config: { format: { type: 'json_schema', schema: PARSE_SCHEMA } },
      messages: [{ role: 'user', content: rawText }],
    });
    console.log('[case-parse] usage:', response.usage);
    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') return null;
    const parsed = JSON.parse(textBlock.text) as ParsedReport;
    if (!Array.isArray(parsed.student_ids) || typeof parsed.summary !== 'string') return null;
    return parsed;
  } catch (error) {
    console.error('[case-parse] failed:', error);
    return null;
  }
}
