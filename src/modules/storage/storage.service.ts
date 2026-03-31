import { 
  PutObjectCommand, 
  GetObjectCommand, 
  DeleteObjectCommand, 
  ListObjectsV2Command 
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { s3Client, BUCKET_NAME } from '../../shared/s3.js';

export class StorageService {
  async uploadFile(projectId: string, file: any) {
    const fileExtension = path.extname(file.filename);
    const fileName = `${uuidv4()}${fileExtension}`;
    const key = `${projectId}/uploads/${fileName}`;

    const buffer = await file.toBuffer();

    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: file.mimetype,
      })
    );

    return {
      key,
      filename: fileName,
      mimetype: file.mimetype,
      size: buffer.length,
    };
  }

  async getFileUrl(key: string) {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    return getSignedUrl(s3Client, command, { expiresIn: 3600 });
  }

  async deleteFile(key: string) {
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      })
    );
  }

  async listFiles(projectId: string) {
    const prefix = `${projectId}/uploads/`;
    const command = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: prefix,
    });

    const response = await s3Client.send(command);
    
    return (response.Contents || []).map((item) => ({
      key: item.Key,
      size: item.Size,
      lastModified: item.LastModified,
    }));
  }
}
