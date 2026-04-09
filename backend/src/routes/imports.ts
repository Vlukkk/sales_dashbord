import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';

export async function registerImportRoutes(app: FastifyInstance) {
  app.get('/api/imports', async () => {
    const result = await pool.query<{
      id: number;
      source_type: string;
      filename: string;
      status: string;
      rows_total: number | null;
      rows_inserted: number | null;
      rows_updated: number | null;
      rows_skipped: number | null;
      created_at: string;
      finished_at: string | null;
    }>(`
      SELECT
        id,
        source_type,
        filename,
        status,
        rows_total,
        rows_inserted,
        rows_updated,
        rows_skipped,
        created_at::text,
        finished_at::text
      FROM data_imports
      ORDER BY id DESC
      LIMIT 20
    `);

    return {
      items: result.rows,
    };
  });
}
