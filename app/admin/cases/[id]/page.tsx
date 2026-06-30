'use client';

import { useParams } from 'next/navigation';
import { CaseDetailView } from '../CaseDetailView';

/**
 * Standalone report detail route. Used on mobile (where the board navigates
 * here) and for deep links. On desktop the board renders <CaseDetailView> inline
 * as a right-hand panel instead of navigating here. Both share one component.
 */
export default function CaseDetailPage() {
  const params = useParams<{ id: string }>();
  return <CaseDetailView caseId={params.id} variant="page" />;
}
