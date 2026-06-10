import { adminDb } from './firebase-admin';
export * from './messages-shared';
import { DEFAULT_TEMPLATES, type MessageTemplates } from './messages-shared';

const DOC = 'message_templates';

export async function getMessageTemplates(): Promise<MessageTemplates> {
  const doc = await adminDb.collection('config').doc(DOC).get();
  if (!doc.exists) return { ...DEFAULT_TEMPLATES };
  return { ...DEFAULT_TEMPLATES, ...(doc.data() as Partial<MessageTemplates>) };
}

export async function setMessageTemplates(partial: Partial<MessageTemplates>): Promise<MessageTemplates> {
  await adminDb.collection('config').doc(DOC).set(partial, { merge: true });
  return getMessageTemplates();
}
