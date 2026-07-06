require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const { connectDB } = require('./db');
const authRoutes = require('./routes/auth');

const app = express();

app.use(cors({ origin: (process.env.CORS_ORIGINS || '*').split(',').map((s) => s.trim()) }));
app.use(express.json({ limit: '10mb' }));

// File caricati (documenti, allegati) — serviti staticamente dietro auth
// a livello di route (vedi routes/documenti.js quando verrà aggiunto).
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
// Le route per presenze, assenze, cambi turno, documenti, acconti,
// liquidazioni, avvisi verranno montate qui man mano che vengono implementate
// (vedi task in corso — questa è la prima porzione del backend).

app.use((err, req, res, next) => {
  console.error('[Errore]', err);
  res.status(500).json({ error: 'Errore interno del server' });
});

const PORT = process.env.PORT || 4000;

connectDB()
  .then(() => {
    app.listen(PORT, () => console.log(`[Server] In ascolto sulla porta ${PORT}`));
  })
  .catch((e) => {
    console.error('[DB] Connessione fallita:', e.message);
    process.exit(1);
  });
