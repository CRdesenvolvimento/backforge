const IDENTIFIER_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;
const PROJECT_ID_REGEX = /^[A-Za-z0-9-]+$/;

export function toProjectSchema(projectId: string) {
  if (!PROJECT_ID_REGEX.test(projectId)) {
    throw new Error('Invalid project identifier');
  }

  return `project_${projectId.replace(/-/g, '_')}`;
}

export function toSqlIdentifier(identifier: string, label = 'identifier') {
  if (!IDENTIFIER_REGEX.test(identifier)) {
    throw new Error(`Invalid ${label}`);
  }

  return identifier;
}

export function toSqlIdentifierList(identifiers: string[], label = 'identifier') {
  return identifiers.map((identifier) => toSqlIdentifier(identifier, label));
}

export function toSortDirection(order: unknown): 'asc' | 'desc' {
  return String(order).toLowerCase() === 'asc' ? 'asc' : 'desc';
}

export function toPositiveInt(value: unknown, fallback: number, max = 100) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(Math.floor(parsed), max);
}
