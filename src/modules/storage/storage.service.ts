import crypto from 'node:crypto';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import type { MultipartFile } from '@fastify/multipart';
import { prisma } from '../../shared/prisma.js';
import { getS3Config } from '../../shared/env.js';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';

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
  await fsPromises.mkdir(uploadsRoot, { recursive: true });
}


export class StorageService {
  private s3Client: S3Client | null = null;
  private s3Bucket: string | null = null;

  constructor() {
    const s3Config = getS3Config();
    if (s3Config) {
      const { bucket, ...clientConfig } = s3Config;
      this.s3Client = new S3Client(clientConfig);
      this.s3Bucket = bucket;
    }
  }

  async uploadFile(projectId: string, file: MultipartFile) {
    const originalName = sanitizeOriginalName(file.filename);
    const extension = sanitizeExtension(originalName);
    const storedFilename = `${Date.now()}-${crypto.randomUUID()}${extension}`;
    const buffer = await file.toBuffer();
    const mimeType = getStoredFileMimeType(file.mimetype);

    if (this.s3Client && this.s3Bucket) {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.s3Bucket,
          Key: storedFilename,
          Body: buffer,
          ContentType: mimeType,
        })
      );
    } else {
      await ensureUploadsDirectory();
      const destinationPath = path.join(uploadsRoot, storedFilename);
      await fsPromises.writeFile(destinationPath, buffer);
    }

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

  async getFile(filename: string): Promise<Readable | null> {
    if (this.s3Client && this.s3Bucket) {
      try {
        const response = await this.s3Client.send(
          new GetObjectCommand({
            Bucket: this.s3Bucket,
            Key: filename,
          })
        );
        return response.Body as Readable;
      } catch {
        return null;
      }
    }

    const filePath = path.join(uploadsRoot, filename);
    try {
      await fsPromises.access(filePath);
      return fs.createReadStream(filePath) as unknown as Readable;
    } catch {
      return null;
    }
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

    if (this.s3Client && this.s3Bucket) {
      try {
        await this.s3Client.send(
          new DeleteObjectCommand({
            Bucket: this.s3Bucket,
            Key: existingFile.filename,
          })
        );
      } catch {
        // Silently continue if S3 delete fails
      }
    } else {
      try {
        await fsPromises.unlink(path.join(uploadsRoot, existingFile.filename));
      } catch {
        // Silently continue if local delete fails
      }
    }

    return true;
  }

  getUploadsRoot() {
    return uploadsRoot;
  }
}

export const storageService = new StorageService();
