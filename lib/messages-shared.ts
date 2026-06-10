export interface MessageTemplates {
  parent: string;
  dorm_staff: string;
}

export const DEFAULT_TEMPLATES: MessageTemplates = {
  parent:
    'Hi {parent_first}, this is David Biel with the TTU Band & Orchestra Camp. ' +
    '{kid_first} was marked missing from {session} and we are working to locate them. ' +
    'Please reply or call if you know where {kid_first} is.',
  dorm_staff:
    'TTUBOC: {kid_name} ({dorm_building} {dorm_room}) was reported missing from {session}. ' +
    'Can you check the room and text me back?',
};

export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? '');
}

/** Cross-platform sms: URI (the `?&body=` form works on both iOS and Android). */
export function smsHref(phone: string, body: string): string {
  return `sms:${phone}?&body=${encodeURIComponent(body)}`;
}
