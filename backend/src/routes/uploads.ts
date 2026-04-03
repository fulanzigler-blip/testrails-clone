import { FastifyInstance } from 'fastify';
import path from 'path';
import fs from 'fs';
import { successResponse, errorResponses } from '../utils/response';

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
];

export default async function uploadsRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/',
    {
      onRequest: [fastify.authenticate],
    },
    async (request, reply) => {
      try {
        const data = await request.file();

        if (!data) {
          return errorResponses(reply, 'No file uploaded', 400);
        }

        if (!ALLOWED_MIME_TYPES.includes(data.mimetype)) {
          return errorResponses(
            reply,
            `Invalid file type: ${data.mimetype}. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`,
            400
          );
        }

        const uploadDir = process.env.UPLOAD_DIR || './uploads';

        fs.mkdirSync(uploadDir, { recursive: true });

        // Derive extension from validated MIME type, not client-supplied filename
        const MIME_TO_EXT: Record<string, string> = {
          'image/jpeg': '.jpg',
          'image/png': '.png',
          'image/gif': '.gif',
          'image/webp': '.webp',
          'application/pdf': '.pdf',
        };
        const ext = MIME_TO_EXT[data.mimetype];
        const filename = `${crypto.randomUUID()}${ext}`;
        const filePath = path.join(uploadDir, filename);

        const buffer = await data.toBuffer();
        fs.writeFileSync(filePath, buffer);

        return successResponse(reply, {
          url: '/files/' + filename,
          filePath: filename,
        });
      } catch (error) {
        request.log.error(error);
        return errorResponses(reply, 'File upload failed', 500);
      }
    }
  );
}
