const http = require('http');
const pool = require('./DBconnection'); 
const bcrypt = require('bcrypt');
require('dotenv').config();

const server = http.createServer(async (req, res) => {
  // --- 1. CONFIGURATION DES CORS ---
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE'); // AJOUT DE DELETE
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // --- 2. ROUTE : CONNEXION (AVEC ROLE) ---
  if (req.url === '/api/login' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const { email, password } = JSON.parse(body);
        // On récupère le champ 'role' (assure-toi qu'il existe en base)
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        
        if (result.rows.length === 0) {
          res.writeHead(401); return res.end(JSON.stringify({ error: "Identifiants incorrects." }));
        }
        
        const isMatch = await bcrypt.compare(password, result.rows[0].password_hash);
        if (!isMatch) {
          res.writeHead(401); return res.end(JSON.stringify({ error: "Identifiants incorrects." }));
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          id: result.rows[0].id, 
          fullname: result.rows[0].fullname,
          role: result.rows[0].role || 'client' // Renvoie le rôle
        }));
      } catch (err) {
        res.writeHead(500); res.end(JSON.stringify({ error: "Erreur serveur." }));
      }
    });
  }

  // --- 3. ROUTE : AJOUTER UN CLIENT (AVEC LIENS) ---
  else if (req.url === '/api/clients' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const { name, company, user_id, mission, deadline, repo_link, project_link } = JSON.parse(body);
        
        const sql = `
          INSERT INTO clients (name, company, user_id, mission, deadline, repo_link, project_link) 
          VALUES ($1, $2, $3, $4, $5, $6, $7) 
          RETURNING *`;
        
        const result = await pool.query(sql, [name, company, user_id, mission, deadline, repo_link, project_link]);
        
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result.rows[0]));
      } catch (err) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: "Erreur lors de l'ajout" }));
      }
    });
  }

  // --- 4. ROUTE : SUPPRIMER UN CLIENT (DELETE) ---
  else if (req.url.startsWith('/api/clients/') && req.method === 'DELETE') {
    const id = req.url.split('/')[3]; // Récupère l'ID après /api/clients/
    try {
      // 1. Supprimer les messages liés pour éviter les erreurs de clés étrangères
      await pool.query('DELETE FROM communications WHERE client_id = $1', [id]);
      
      // 2. Supprimer le client
      const result = await pool.query('DELETE FROM clients WHERE id = $1 RETURNING *', [id]);
      
      if (result.rowCount === 0) {
        res.writeHead(404);
        return res.end(JSON.stringify({ error: "Client non trouvé" }));
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: "Client et données associés supprimés avec succès" }));
    } catch (err) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: "Erreur lors de la suppression" }));
    }
  }

  // --- 5. RÉCUPÉRER LES CLIENTS (EXISTANT) ---
  else if (req.url === '/api/clients' && req.method === 'GET') {
    try {
      const result = await pool.query('SELECT * FROM clients ORDER BY created_at DESC');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result.rows));
    } catch (err) {
      res.writeHead(500); res.end(JSON.stringify({ error: "Erreur DB." }));
    }
  }

  // --- 6. COMMUNICATIONS (EXISTANT) ---
  else if (req.url.startsWith('/api/communications') && req.method === 'GET') {
    const urlParams = new URL(req.url, `http://${req.headers.host}`);
    const clientId = urlParams.searchParams.get('client_id');
    try {
      const result = await pool.query('SELECT * FROM communications WHERE client_id = $1 ORDER BY created_at ASC', [clientId]);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result.rows));
    } catch (err) {
      res.writeHead(500); res.end(JSON.stringify({ error: err.message }));
    }
  }
  else if (req.url === '/api/communications' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const { client_id, sender_type, message } = JSON.parse(body);
        const result = await pool.query(
          'INSERT INTO communications (client_id, sender_type, message) VALUES ($1, $2, $3) RETURNING *',
          [client_id, sender_type, message]
        );
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result.rows[0]));
      } catch (err) {
        res.writeHead(500); res.end(JSON.stringify({ error: err.message }));
      }
    });
  }

  else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: "Route non trouvée." }));
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Serveur backend lancé sur http://localhost:${PORT}`);
});