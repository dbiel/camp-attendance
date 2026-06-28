import Anthropic from '@anthropic-ai/sdk';
import type { Student } from './types';
import type { Contact } from './contacts';

/** One reported kid. A single text may mention several. */
export interface ParsedPerson {
  /** Roster ids of candidate students, best match first (max 3). Empty = no match. */
  student_ids: string[];
  /** The raw name string the reporter used, for display when no match. */
  student_query: string | null;
  summary: string;
  session_label: string | null;
}

export interface ParsedReport {
  /** One entry per kid mentioned (a text can list 7–10). */
  people: ParsedPerson[];
  /** Reporter is shared across everyone in the same text. */
  reporter_contact_id: string | null;
  reporter_name: string | null;
  reporter_phone: string | null;
}

const PARSE_SCHEMA = {
  type: 'object',
  properties: {
    people: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          student_ids: { type: 'array', items: { type: 'string' } },
          student_query: { type: ['string', 'null'] },
          summary: { type: 'string' },
          session_label: { type: ['string', 'null'] },
        },
        required: ['student_ids', 'student_query', 'summary', 'session_label'],
        additionalProperties: false,
      },
    },
    reporter_contact_id: { type: ['string', 'null'] },
    reporter_name: { type: ['string', 'null'] },
    reporter_phone: { type: ['string', 'null'] },
  },
  required: ['people', 'reporter_contact_id', 'reporter_name', 'reporter_phone'],
  additionalProperties: false,
} as const;

const INSTRUCTIONS = `You parse incident reports texted to a band-camp director about campers missing from class.
A single text may mention SEVERAL kids — produce one "people" entry per kid.
For EACH kid:
- student_ids: ids from the roster below matching that kid. Names may be misspelled or use nicknames — fuzzy match. Best match first, up to 3 candidates. Empty array if nothing plausibly matches.
- student_query: that kid's name as written in the message.
- summary: one short sentence describing what happened to that kid.
- session_label: where/when that kid was missed, as stated (e.g. "Trumpet sectional, period 3"); null if not stated.
The reporter is shared for the whole message:
- reporter_contact_id: the id from the contact list if the sender is identifiable by name or phone; otherwise null.
- reporter_name / reporter_phone: name or phone of the sender if present in the text but NOT in the contacts; otherwise null.
If exactly one kid is named, return a single-element people array. Return only data supported by the message — never invent.`;

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
    if (!Array.isArray(parsed.people)) return null;
    return parsed;
  } catch (error) {
    console.error('[case-parse] failed:', error);
    return null;
  }
}
