import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
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
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const data = await (request as any).file();

        if (!data) {
          return errorResponses.badRequest(reply, 'No file uploaded');
        }

        if (!ALLOWED_MIME_TYPES.includes(data.mimetype)) {
          return errorResponses.badRequest(
            reply,
            `Invalid file type: ${data.mimetype}. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`
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
        return errorResponses.internal(reply);
      }
    }
  );
}
