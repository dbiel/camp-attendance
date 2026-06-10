import { describe, it, expect, vi, beforeEach } from 'vitest';

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class Anthropic {
    messages = { create: createMock };
  },
}));

import { parseReport } from '@/lib/case-parse';

const students = [
  { id: 's1', first_name: 'Jonathan', last_name: 'Smith', preferred_name: 'Johnny', ensemble: 'Band 1', dorm_building: 'Murdough', instrument: 'Trumpet' },
  { id: 's2', first_name: 'Jane', last_name: 'Smith', preferred_name: null, ensemble: 'Orchestra 1', dorm_building: 'Hulen', instrument: 'Violin' },
] as any[];

const contacts = [
  { id: 'c1', name: 'Mr. Jones', phone: '+18065550101', role: 'faculty' },
] as any[];

beforeEach(() => vi.clearAllMocks());

describe('parseReport', () => {
  it('returns the parsed structure from the model JSON', async () => {
    createMock.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({
        student_ids: ['s1'],
        student_query: 'johnny smith',
        reporter_contact_id: 'c1',
        reporter_name: null,
        reporter_phone: null,
        summary: 'Missing from trumpet sectional',
        session_label: 'Trumpet sectional, period 3',
      }) }],
    });
    const result = await parseReport('johnny smtih not in trumpet sectional - jones', students, contacts);
    expect(result?.student_ids).toEqual(['s1']);
    expect(result?.reporter_contact_id).toBe('c1');
  });

  it('includes the roster in the system prompt with cache_control', async () => {
    createMock.mockResolvedValue({ content: [{ type: 'text', text: '{}' }] });
    await parseReport('whatever', students, contacts);
    const req = createMock.mock.calls[0][0];
    const systemBlocks = req.system as Array<{ text: string; cache_control?: object }>;
    const rosterBlock = systemBlocks.find((b) => b.text.includes('Jonathan'));
    const contactsBlock = systemBlocks.find((b) => b.text.includes('Mr. Jones'));
    expect(rosterBlock?.cache_control).toEqual({ type: 'ephemeral' });
    expect(contactsBlock?.cache_control).toEqual({ type: 'ephemeral' });
    expect(rosterBlock).not.toBe(contactsBlock);
    expect(req.output_config?.format?.type).toBe('json_schema');
  });

  it('returns null when the API call throws', async () => {
    createMock.mockRejectedValue(new Error('boom'));
    expect(await parseReport('text', students, contacts)).toBeNull();
  });

  it('returns null when the model returns non-JSON', async () => {
    createMock.mockResolvedValue({ content: [{ type: 'text', text: 'sorry, I cannot' }] });
    expect(await parseReport('text', students, contacts)).toBeNull();
  });
});
