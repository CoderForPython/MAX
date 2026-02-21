import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database('messenger.db');
const JWT_SECRET = process.env.JWT_SECRET || 'max-messenger-secret-key';

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    avatar TEXT
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER,
    receiver_id INTEGER,
    content TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(sender_id) REFERENCES users(id),
    FOREIGN KEY(receiver_id) REFERENCES users(id)
  );
`);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Debug logger for ALL requests
app.use((req, res, next) => {
  console.log(`[DEBUG] ${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Auth Routes
console.log('Registering auth routes...');
app.post(['/api/signup', '/api/signup/'], (req, res) => {
  const { username, password } = req.body;
  console.log(`Signup attempt for: ${username}`);
  try {
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    const hashedPassword = bcrypt.hashSync(password, 10);
    const avatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`;
    const info = db.prepare('INSERT INTO users (username, password, avatar) VALUES (?, ?, ?)').run(username, hashedPassword, avatar);
    const userId = Number(info.lastInsertRowid);
    const token = jwt.sign({ id: userId, username }, JWT_SECRET);
    console.log(`Signup successful for: ${username}, ID: ${userId}`);
    res.json({ token, user: { id: userId, username, avatar } });
  } catch (e: any) {
    console.error('Signup error:', e);
    if (e.code === 'SQLITE_CONSTRAINT') {
      res.status(400).json({ error: 'Это имя пользователя уже занято' });
    } else {
      res.status(500).json({ error: 'Ошибка сервера при регистрации' });
    }
  }
});

app.post(['/api/login', '/api/login/'], (req, res) => {
  const { username, password } = req.body;
  console.log(`Login attempt for: ${username}`);
  try {
    const user: any = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (user && bcrypt.compareSync(password, user.password)) {
      const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET);
      console.log(`Login successful for: ${username}`);
      res.json({ token, user: { id: user.id, username: user.username, avatar: user.avatar } });
    } else {
      console.log(`Login failed for: ${username} - Invalid credentials`);
      res.status(401).json({ error: 'Неверное имя пользователя или пароль' });
    }
  } catch (e) {
    console.error('Login error:', e);
    res.status(500).json({ error: 'Ошибка сервера при входе' });
  }
});

app.get(['/api/users', '/api/users/'], (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded: any = jwt.verify(token, JWT_SECRET);
    const users = db.prepare('SELECT id, username, avatar FROM users WHERE id != ?').all(decoded.id);
    res.json(users);
  } catch (e) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

app.get('/api/messages/:otherId', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded: any = jwt.verify(token, JWT_SECRET);
    const messages = db.prepare(`
      SELECT * FROM messages 
      WHERE (sender_id = ? AND receiver_id = ?) 
      OR (sender_id = ? AND receiver_id = ?)
      ORDER BY timestamp ASC
    `).all(decoded.id, req.params.otherId, req.params.otherId, decoded.id);
    res.json(messages);
  } catch (e) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// Global error handler
app.use((err: any, req: any, res: any, next: any) => {
  console.error('Express Global Error:', err);
  if (!res.headersSent) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// WebSocket logic
const clients = new Map<number, WebSocket>();

wss.on('connection', (ws, req) => {
  let userId: number | null = null;

  ws.on('message', (data) => {
    const message = JSON.parse(data.toString());
    
    if (message.type === 'auth') {
      try {
        const decoded: any = jwt.verify(message.token, JWT_SECRET);
        userId = decoded.id;
        if (userId) clients.set(userId, ws);
      } catch (e) {
        ws.close();
      }
    } else if (message.type === 'message' && userId) {
      const { receiverId, content } = message;
      const info = db.prepare('INSERT INTO messages (sender_id, receiver_id, content) VALUES (?, ?, ?)').run(userId, receiverId, content);
      const savedMsg = {
        id: info.lastInsertRowid,
        sender_id: userId,
        receiver_id: receiverId,
        content,
        timestamp: new Date().toISOString()
      };

      // Send to receiver if online
      const receiverWs = clients.get(receiverId);
      if (receiverWs && receiverWs.readyState === WebSocket.OPEN) {
        receiverWs.send(JSON.stringify({ type: 'message', message: savedMsg }));
      }
      // Send back to sender for confirmation
      ws.send(JSON.stringify({ type: 'message', message: savedMsg }));
    }
  });

  ws.on('close', () => {
    if (userId) clients.delete(userId);
  });
});

// Vite Integration
async function initVite() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  server.listen(3000, '0.0.0.0', () => {
    console.log('Server running on http://localhost:3000');
  });
}

initVite();
