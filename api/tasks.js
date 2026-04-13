const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id       SERIAL PRIMARY KEY,
        text     TEXT        NOT NULL,
        status   TEXT        NOT NULL DEFAULT 'todo'
                   CHECK (status IN ('todo','progress','done')),
        priority INTEGER     NOT NULL DEFAULT 5
                   CHECK (priority BETWEEN 1 AND 10),
        created  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    if (req.method === 'GET') {
      const { rows } = await pool.query(
        `SELECT * FROM tasks ORDER BY
           CASE WHEN status='done' THEN 1 ELSE 0 END,
           priority DESC, created DESC`
      );
      return res.status(200).json(rows);
    }

    if (req.method === 'POST') {
      const { text, status = 'todo', priority = 5 } = req.body;
      if (!text) return res.status(400).json({ error: 'text requerido' });
      const { rows } = await pool.query(
        `INSERT INTO tasks (text, status, priority) VALUES ($1,$2,$3) RETURNING *`,
        [text, status, priority]
      );
      return res.status(201).json(rows[0]);
    }

    if (req.method === 'PUT') {
      const { id } = req.query;
      const { text, status, priority } = req.body;
      const sets = [], vals = [];
      if (text     !== undefined) { sets.push(`text=$${sets.length+1}`);     vals.push(text); }
      if (status   !== undefined) { sets.push(`status=$${sets.length+1}`);   vals.push(status); }
      if (priority !== undefined) { sets.push(`priority=$${sets.length+1}`); vals.push(priority); }
      if (!sets.length) return res.status(400).json({ error: 'nada que actualizar' });
      sets.push(`updated=NOW()`);
      vals.push(id);
      const { rows } = await pool.query(
        `UPDATE tasks SET ${sets.join(',')} WHERE id=$${vals.length} RETURNING *`, vals
      );
      if (!rows.length) return res.status(404).json({ error: 'no encontrado' });
      return res.status(200).json(rows[0]);
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      await pool.query(`DELETE FROM tasks WHERE id=$1`, [id]);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'método no permitido' });

  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
};
