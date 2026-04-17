'use client';

import { ALL_SCHEMAS, type EntityName } from '@/lib/import-schemas';

const DESCRIPTIONS: Record<EntityName, string> = {
  students:
    'Campers with instrument, ensemble, dorm, and parent contact information.',
  faculty: 'Instructors and staff — name, role, email.',
  sessions:
    'Rehearsals, sectionals, masterclasses, and electives assigned to a period.',
  enrollments: 'Student-to-session roster assignments (by id or name).',
};

interface Props {
  onSelect: (entity: EntityName) => void;
}

export function EntityStep({ onSelect }: Props) {
  return (
    <section aria-labelledby="import-entity-heading">
      <h2 id="import-entity-heading" className="camp-heading text-lg mb-3">
        What are you importing?
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {(Object.keys(ALL_SCHEMAS) as EntityName[]).map((entity) => {
          const schema = ALL_SCHEMAS[entity];
          const requiredCount = schema.fields.filter((f) => f.required).length;
          return (
            <button
              key={entity}
              type="button"
              onClick={() => onSelect(entity)}
              className="camp-card p-4 text-left hover:border-camp-green hover:shadow-md transition-all border border-transparent focus:outline-none focus:ring-2 focus:ring-camp-green"
            >
              <div className="font-bold text-camp-green text-lg capitalize">
                {schema.label}
              </div>
              <p className="text-sm text-gray-600 mt-1">
                {DESCRIPTIONS[entity]}
              </p>
              <div className="text-xs text-gray-500 mt-2">
                {requiredCount} required field{requiredCount === 1 ? '' : 's'} •{' '}
                {schema.fields.length} total
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
