import { FastifyRequest, FastifyReply } from 'fastify';
import { getJsonCache, invalidateCachePrefix, setJsonCache } from '../../shared/cache.js';
import { QueryBuilderService } from './query-builder.service.js';
import { PolicyService } from './policy.service.js';
import { HookService } from './hook.service.js';

const queryBuilder = new QueryBuilderService();
const policyService = new PolicyService();
const hookService = new HookService();

export class ApiEngineController {
  async handleGet(request: FastifyRequest, reply: FastifyReply) {
    const { table } = request.params as { table: string };
    const projectId = (request as any).projectId;
    const userId = (request as any).userId;

    await policyService.validateAccess(projectId, table, 'read', userId);

    // Cache check
    const cacheKey = `cache:${projectId}:${table}:${JSON.stringify(request.query)}`;
    const cached = await getJsonCache<unknown>(cacheKey, 'api-engine');
    if (cached) return cached;

    const data = await queryBuilder.buildFindMany(table, projectId, request.query);
    
    await setJsonCache(cacheKey, 'api-engine', data, 60);
    return data;
  }

  async handlePost(request: FastifyRequest, reply: FastifyReply) {
    const { table } = request.params as { table: string };
    const projectId = (request as any).projectId;
    const userId = (request as any).userId;

    await policyService.validateAccess(projectId, table, 'create', userId);

    let data = request.body;
    data = await hookService.executeHook('before', 'create', table, data);

    const result = await queryBuilder.buildInsert(table, projectId, data);

    await hookService.executeHook('after', 'create', table, result);
    
    // Invalidate cache
    await invalidateCachePrefix(`cache:${projectId}:${table}:`, 'api-engine');

    return reply.status(201).send(result);
  }
}
