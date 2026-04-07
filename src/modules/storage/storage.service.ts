import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { MultipartFile } from '@fastify/multipart';
import { prisma } from '../../shared/prisma.js';

const uploadsRoot = path.resolve(process.cwd(), 'uploads');
const DEFAULT_PUBLIC_MIME_TYPE = 'application/octet-stream';
const INLINE_PUBLIC_MIME_TYPES = new Set([
  'image/avif',
  'image/bmp',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const BLOCKED_EXTENSIONS = new Set(['.html', '.htm', '.svg', '.js', '.jsx', '.ts', '.tsx', '.php', '.sh', '.bash', '.exe', '.bat']);

function sanitizeExtension(filename: string) {
  const extension = path.extname(filename).toLowerCase();
  
  if (BLOCKED_EXTENSIONS.has(extension)) {
    throw new Error(`File extension ${extension} is not allowed for security reasons`);
  }

  return extension.replace(/[^.\w-]/g, '');
}

function sanitizeOriginalName(filename: string) {
  const normalizedName = path.basename(filename).replace(/[^\w.\-() ]+/g, '_').trim();
  return normalizedName || 'upload';
}

function normalizeMimeType(mimeType?: string | null) {
  const normalizedMimeType = mimeType
    ?.split(';')[0]
    ?.trim()
    ?.toLowerCase();

  return normalizedMimeType || DEFAULT_PUBLIC_MIME_TYPE;
}

export function getStoredFileMimeType(mimeType?: string | null) {
  return normalizeMimeType(mimeType);
}

export function getPublicFileResponseMetadata(mimeType: string | null | undefined, originalName: string) {
  const normalizedMimeType = normalizeMimeType(mimeType);
  const safeMimeType = INLINE_PUBLIC_MIME_TYPES.has(normalizedMimeType)
    ? normalizedMimeType
    : DEFAULT_PUBLIC_MIME_TYPE;
  const dispositionType = safeMimeType === DEFAULT_PUBLIC_MIME_TYPE ? 'attachment' : 'inline';

  return {
    mimeType: safeMimeType,
    contentDisposition: `${dispositionType}; filename="${sanitizeOriginalName(originalName)}"`,
  };
}

async function ensureUploadsDirectory() {
  await fs.mkdir(uploadsRoot, { recursive: true });
}

export class StorageService {
  async uploadFile(projectId: string, file: MultipartFile) {
    await ensureUploadsDirectory();

    const originalName = sanitizeOriginalName(file.filename);
    const extension = sanitizeExtension(originalName);
    const storedFilename = `${Date.now()}-${crypto.randomUUID()}${extension}`;
    const destinationPath = path.join(uploadsRoot, storedFilename);
    const buffer = await file.toBuffer();

    await fs.writeFile(destinationPath, buffer);

    const createdFile = await prisma.storedFile.create({
      data: {
        projectId,
        filename: storedFilename,
        originalName,
        mimeType: getStoredFileMimeType(file.mimetype),
        size: buffer.length,
        url: `/public/files/${storedFilename}`,
      },
      select: {
        id: true,
        projectId: true,
        filename: true,
        originalName: true,
        mimeType: true,
        size: true,
        url: true,
        createdAt: true,
      },
    });

    return createdFile;
  }

  async listFiles(projectId: string) {
    return prisma.storedFile.findMany({
      where: { projectId },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        projectId: true,
        filename: true,
        originalName: true,
        mimeType: true,
        size: true,
        url: true,
        createdAt: true,
      },
    });
  }

  async deleteFile(projectId: string, fileId: string) {
    const existingFile = await prisma.storedFile.findFirst({
      where: {
        id: fileId,
        projectId,
      },
      select: {
        id: true,
        filename: true,
      },
    });

    if (!existingFile) {
      return false;
    }

    await prisma.storedFile.delete({
      where: {
        id: existingFile.id,
      },
    });

    try {
      await fs.unlink(path.join(uploadsRoot, existingFile.filename));
    } catch {
      return true;
    }

    return true;
  }

  getUploadsRoot() {
    return uploadsRoot;
  }
}
