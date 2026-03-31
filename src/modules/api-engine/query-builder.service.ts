import { prisma } from '../../shared/prisma.js';
import { toPositiveInt, toProjectSchema, toSortDirection, toSqlIdentifier, toSqlIdentifierList } from '../../shared/sql.js';

export class QueryBuilderService {
  async buildFindMany(table: string, projectId: string, query: any) {
    const { page = 1, limit = 10, sort = 'createdAt', order = 'desc', ...filters } = query;
    const skip = (toPositiveInt(page, 1) - 1) * toPositiveInt(limit, 10);
    const take = toPositiveInt(limit, 10);

    const schemaName = toProjectSchema(projectId);
    const safeTable = toSqlIdentifier(table, 'table name');
    const safeSort = toSqlIdentifier(String(sort), 'sort column');
    const safeOrder = toSortDirection(order);

    let whereClause = 'WHERE 1=1';
    const params: any[] = [];

    Object.entries(filters).forEach(([key, value], index) => {
      const safeKey = toSqlIdentifier(key, 'filter field');
      whereClause += ` AND ${safeKey} = $${index + 1}`;
      params.push(value);
    });

    const sql = `
      SELECT * FROM ${schemaName}.${safeTable}
      ${whereClause}
      ORDER BY ${safeSort} ${safeOrder}
      LIMIT ${take} OFFSET ${skip}
    `;

    return prisma.$queryRawUnsafe(sql, ...params);
  }

  async buildInsert(table: string, projectId: string, data: any) {
    const schemaName = toProjectSchema(projectId);
    const safeTable = toSqlIdentifier(table, 'table name');
    const keys = Object.keys(data);
    const values = Object.values(data);

    if (!keys.length) {
      throw new Error('Insert data cannot be empty');
    }

    const columns = toSqlIdentifierList(keys, 'column name').join(', ');
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');

    const sql = `
      INSERT INTO ${schemaName}.${safeTable} (${columns})
      VALUES (${placeholders})
      RETURNING *
    `;

    return prisma.$queryRawUnsafe(sql, ...values);
  }
}
