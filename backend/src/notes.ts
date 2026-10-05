import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from './auth.js';
import { pool } from './db.js';

const MAX_CONTENT = 500_000;

const createSchema = z.object({
  title: z.string().trim().max(200).optional(),
  content: z.string().max(MAX_CONTENT).optional(),
  sourceRoom: z.string().max(64).optional(),
});

const updateSchema = z.object({
  title: z.string().trim().max(200).optional(),
  content: z.string().max(MAX_CONTENT).optional(),
});

const idSchema = z.uuid();

const COLUMNS = `id, title, content, source_room AS "sourceRoom",
  created_at AS "createdAt", updated_at AS "updatedAt"`;

export const notesRouter = Router();
notesRouter.use(requireAuth);

notesRouter.get('/', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT ${COLUMNS} FROM notes WHERE user_id = $1 ORDER BY updated_at DESC`,
    [req.user!.id],
  );
  res.json({ notes: rows });
});

notesRouter.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }
  const { title, content, sourceRoom } = parsed.data;
  const { rows } = await pool.query(
    `INSERT INTO notes (user_id, title, content, source_room) VALUES ($1, $2, $3, $4)
     RETURNING ${COLUMNS}`,
    [req.user!.id, title || 'Untitled', content ?? '', sourceRoom ?? null],
  );
  res.status(201).json({ note: rows[0] });
});

notesRouter.get('/:id', async (req, res) => {
  if (!idSchema.safeParse(req.params.id).success) {
    res.status(404).json({ error: 'Note not found' });
    return;
  }
  const { rows } = await pool.query(`SELECT ${COLUMNS} FROM notes WHERE id = $1 AND user_id = $2`, [
    req.params.id,
    req.user!.id,
  ]);
  if (!rows[0]) {
    res.status(404).json({ error: 'Note not found' });
    return;
  }
  res.json({ note: rows[0] });
});

notesRouter.put('/:id', async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!idSchema.safeParse(req.params.id).success || !parsed.success) {
    res.status(400).json({ error: 'Invalid input' });
    return;
  }
  const { title, content } = parsed.data;
  const { rows } = await pool.query(
    `UPDATE notes SET
       title = COALESCE(NULLIF($3, ''), title),
       content = COALESCE($4, content),
       updated_at = now()
     WHERE id = $1 AND user_id = $2
     RETURNING ${COLUMNS}`,
    [req.params.id, req.user!.id, title ?? null, content ?? null],
  );
  if (!rows[0]) {
    res.status(404).json({ error: 'Note not found' });
    return;
  }
  res.json({ note: rows[0] });
});

notesRouter.delete('/:id', async (req, res) => {
  if (!idSchema.safeParse(req.params.id).success) {
    res.status(404).json({ error: 'Note not found' });
    return;
  }
  const { rowCount } = await pool.query('DELETE FROM notes WHERE id = $1 AND user_id = $2', [
    req.params.id,
    req.user!.id,
  ]);
  if (!rowCount) {
    res.status(404).json({ error: 'Note not found' });
    return;
  }
  res.status(204).end();
});
