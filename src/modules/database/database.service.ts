import type { Prisma } from '../../generated/prisma-client/index.js';
import { prisma } from '../../shared/prisma.js';

export type TableColumnType = 'string' | 'number' | 'boolean' | 'date';

export interface TableSchemaColumn {
  name: string;
  type: TableColumnType;
}

interface LegacySchemaRow {
  tableId: string;
  name: string;
  type: string;
}

interface ListRowsOptions {
  page?: number;
  limit?: number;
}

function normalizeName(value: string, fallback: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || fallback;
}

function dedupeColumns(columns: TableSchemaColumn[]) {
  const seen = new Set<string>();

  return columns.map((column, index) => {
    const baseName = normalizeName(column.name, `field_${index + 1}`);
    let nextName = baseName;
    let suffix = 2;

    while (seen.has(nextName)) {
      nextName = `${baseName}_${suffix}`;
      suffix += 1;
    }

    seen.add(nextName);
    return {
      name: nextName,
      type: column.type,
    };
  });
}

function normalizeTableSchema(columns: TableSchemaColumn[]) {
  return dedupeColumns(
    columns
      .filter((column) => column.name.trim())
      .map((column) => ({
        name: column.name,
        type: column.type,
      }))
  );
}

function getPagination(page = 1, limit = 20) {
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(100, Math.max(1, limit));

  return {
    page: safePage,
    limit: safeLimit,
    skip: (safePage - 1) * safeLimit,
    take: safeLimit,
  };
}

function coerceValue(column: TableSchemaColumn, value: unknown) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (column.type === 'number') {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  if (column.type === 'boolean') {
    if (typeof value === 'boolean') {
      return value;
    }

    return String(value).toLowerCase() === 'true';
  }

  if (column.type === 'date') {
    return String(value);
  }

  return String(value);
}

function formatRow(row: { id: string; data: Prisma.JsonValue; createdAt: Date }) {
  const data = (row.data ?? {}) as Record<string, unknown>;

  return {
    id: row.id,
    createdAt: row.createdAt,
    data,
    values: data,
    preview: {
      id: row.id,
      ...data,
      _createdAt: row.createdAt,
    },
  };
}

function normalizeColumnType(value: string): TableColumnType {
  if (value === 'number' || value === 'boolean' || value === 'date') {
    return value;
  }

  return 'string';
}

function toLegacySchema(columns: Array<{ name: string; type: string }> = []) {
  return columns.map((column) => ({
    name: normalizeName(column.name, 'field'),
    type: normalizeColumnType(column.type),
  }));
}

function castSchema(value: Prisma.JsonValue | null) {
  if (Array.isArray(value) && value.length > 0) {
    return value as unknown as TableSchemaColumn[];
  }

  return [];
}

function formatTable(table: {
  id: string;
  name: string;
  projectId: string;
  schema: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
  _count?: { rows: number };
}) {
  return {
    id: table.id,
    name: table.name,
    projectId: table.projectId,
    schema: castSchema(table.schema),
    rowsCount: table._count?.rows ?? 0,
    createdAt: table.createdAt,
    updatedAt: table.updatedAt,
  };
}

async function userCanAccessProject(userId: string, projectId: string) {
  const membership = await prisma.membership.findUnique({
    where: {
      userId_projectId: {
        userId,
        projectId,
      },
    },
    select: {
      userId: true,
    },
  });

  return Boolean(membership);
}

export const databaseService = {
  async backfillLegacySchemas() {
    const legacyColumns = await prisma.$queryRaw<LegacySchemaRow[]>`
      SELECT t."id" AS "tableId", c."name", c."type"
      FROM "database_tables" t
      INNER JOIN "database_columns" c ON c."tableId" = t."id"
      WHERE t."schema" IS NULL
      ORDER BY t."id" ASC, c."name" ASC
    `;

    const schemaByTableId = new Map<string, LegacySchemaRow[]>();

    for (const column of legacyColumns) {
      const columns = schemaByTableId.get(column.tableId) ?? [];
      columns.push(column);
      schemaByTableId.set(column.tableId, columns);
    }

    await Promise.all(
      Array.from(schemaByTableId.entries()).map(([tableId, columns]) =>
        prisma.databaseTable.update({
          where: { id: tableId },
          data: {
            schema: toLegacySchema(columns) as Prisma.InputJsonValue,
          },
        })
      )
    );

    return schemaByTableId.size;
  },

  async createTable(userId: string, projectId: string, name: string, columns: TableSchemaColumn[]) {
    const hasAccess = await userCanAccessProject(userId, projectId);

    if (!hasAccess) {
      return null;
    }

    const schema = normalizeTableSchema(columns);

    const table = await prisma.databaseTable.create({
      data: {
        name: normalizeName(name, 'untitled_table'),
        projectId,
        schema: schema as Prisma.InputJsonValue,
      },
      include: {
        _count: {
          select: {
            rows: true,
          },
        },
      },
    });

    return formatTable(table);
  },

  async listTables(userId: string, projectId: string) {
    const hasAccess = await userCanAccessProject(userId, projectId);

    if (!hasAccess) {
      return null;
    }

    const tables = await prisma.databaseTable.findMany({
      where: { projectId },
      orderBy: {
        updatedAt: 'desc',
      },
      include: {
        _count: {
          select: {
            rows: true,
          },
        },
      },
    });

    return tables.map(formatTable);
  },

  async insertRow(userId: string, tableId: string, rawData: Record<string, unknown>) {
    const table = await prisma.databaseTable.findFirst({
      where: {
        id: tableId,
        project: {
          memberships: {
            some: {
              userId,
            },
          },
        },
      },
      select: {
        id: true,
        schema: true,
      },
    });

    if (!table) {
      return null;
    }

    const schema = castSchema(table.schema);
    const data = schema.reduce<Record<string, unknown>>((accumulator, column) => {
      accumulator[column.name] = coerceValue(column, rawData[column.name]);
      return accumulator;
    }, {});

    const row = await prisma.databaseRow.create({
      data: {
        tableId,
        data: data as Prisma.InputJsonValue,
      },
      select: {
        id: true,
        data: true,
        createdAt: true,
      },
    });

    await prisma.databaseTable.update({
      where: { id: tableId },
      data: { updatedAt: new Date() },
    });

    return formatRow(row);
  },

  async listRows(userId: string, tableId: string, options: ListRowsOptions = {}) {
    const table = await prisma.databaseTable.findFirst({
      where: {
        id: tableId,
        project: {
          memberships: {
            some: {
              userId,
            },
          },
        },
      },
      select: {
        id: true,
        name: true,
        schema: true,
        _count: {
          select: {
            rows: true,
          },
        },
      },
    });

    if (!table) {
      return null;
    }

    const pagination = getPagination(options.page, options.limit);
    const rows = await prisma.databaseRow.findMany({
      where: { tableId },
      orderBy: {
        createdAt: 'desc',
      },
      skip: pagination.skip,
      take: pagination.take,
      select: {
        id: true,
        data: true,
        createdAt: true,
      },
    });

    return {
      table: {
        id: table.id,
        name: table.name,
        schema: castSchema(table.schema),
      },
      data: rows.map(formatRow),
      items: rows.map(formatRow),
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        pageSize: pagination.limit,
        total: table._count.rows,
        totalPages: Math.max(1, Math.ceil(table._count.rows / pagination.limit)),
      },
    };
  },

  async deleteRow(userId: string, rowId: string) {
    const row = await prisma.databaseRow.findFirst({
      where: {
        id: rowId,
        table: {
          project: {
            memberships: {
              some: {
                userId,
              },
            },
          },
        },
      },
      select: {
        id: true,
        tableId: true,
      },
    });

    if (!row) {
      return false;
    }

    await prisma.databaseRow.delete({
      where: { id: rowId },
    });

    await prisma.databaseTable.update({
      where: { id: row.tableId },
      data: { updatedAt: new Date() },
    });

    return true;
  },

  async listPublicRows(projectId: string, tableName: string, options: ListRowsOptions = {}) {
    const normalizedTableName = normalizeName(tableName, tableName);
    const table = await prisma.databaseTable.findUnique({
      where: {
        projectId_name: {
          projectId,
          name: normalizedTableName,
        },
      },
      select: {
        id: true,
        name: true,
        schema: true,
        _count: {
          select: {
            rows: true,
          },
        },
      },
    });

    if (!table) {
      return null;
    }

    const pagination = getPagination(options.page, options.limit);
    const rows = await prisma.databaseRow.findMany({
      where: {
        tableId: table.id,
      },
      orderBy: {
        createdAt: 'desc',
      },
      skip: pagination.skip,
      take: pagination.take,
      select: {
        id: true,
        data: true,
        createdAt: true,
      },
    });

    return {
      tableName: table.name,
      schema: castSchema(table.schema),
      data: rows.map((row) => ({
        id: row.id,
        ...((row.data ?? {}) as Record<string, unknown>),
      })),
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        pageSize: pagination.limit,
        total: table._count.rows,
        totalPages: Math.max(1, Math.ceil(table._count.rows / pagination.limit)),
      },
    };
  },

  async ensureStarterTable(projectId: string) {
    const existingTable = await prisma.databaseTable.findUnique({
      where: {
        projectId_name: {
          projectId,
          name: 'sample_items',
        },
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (existingTable) {
      return existingTable.name;
    }

    const table = await prisma.databaseTable.create({
      data: {
        projectId,
        name: 'sample_items',
        schema: [
          { name: 'name', type: 'string' },
          { name: 'category', type: 'string' },
          { name: 'active', type: 'boolean' },
        ] as Prisma.InputJsonValue,
      },
      select: {
        id: true,
        name: true,
      },
    });

    await prisma.databaseRow.createMany({
      data: [
        {
          tableId: table.id,
          data: {
            name: 'Starter item',
            category: 'demo',
            active: true,
          } as Prisma.InputJsonValue,
        },
        {
          tableId: table.id,
          data: {
            name: 'Activation event',
            category: 'growth',
            active: true,
          } as Prisma.InputJsonValue,
        },
      ],
    });

    return table.name;
  },
};
