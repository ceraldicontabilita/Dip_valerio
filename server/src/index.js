require('dotenv').config();
const express = require('express');
const cors = require('cors');

const { connectDB } = require('./db');
const authRoutes = require('./routes/auth');
const profiliRoutes = require('./routes/profili');
const presenzeRoutes = require('./routes/presenze');
const assenzeRoutes = require('./routes/assenze');
const cambiTurnoRoutes = require('./routes/cambiTurno');
const documentiRoutes = require('./routes/documenti');
const accontiRoutes = require('./routes/acconti');
const liquidazioniRoutes = require('./routes/liquidazioni');
const avvisiRoutes = require('./routes/avvisi');
const contrattoTemplateRoutes = require('./routes/contrattoTemplate');
const telegramWebhookRoutes = require('./routes/telegramWebhook');
const telegramNotifyRoutes = require('./routes/telegramNotify');

const app = express();

app.use(cors({ origin: (process.env.CORS_ORIGINS || '*').split(',').map((s) => s.trim()) }));
app.use(express.json({ limit: '10mb' }));

// NB: i file caricati (documenti, allegati malattia) NON sono serviti da una
// cartella statica pubblica — busta paga e certificati medici sono dati
// sensibili. Ogni file passa da una route autenticata che verifica i
// permessi prima di inviarlo (vedi routes/documenti.js e routes/assenze.js).

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/profili', profiliRoutes);
app.use('/api/presenze', presenzeRoutes);
app.use('/api/assenze', assenzeRoutes);
app.use('/api/cambi-turno', cambiTurnoRoutes);
app.use('/api/documenti', documentiRoutes);
app.use('/api/acconti', accontiRoutes);
app.use('/api/liquidazioni', liquidazioniRoutes);
app.use('/api/avvisi', avvisiRoutes);
app.use('/api/contratto-template', contrattoTemplateRoutes);
app.use('/api/telegram', telegramWebhookRoutes);
app.use('/api/telegram', telegramNotifyRoutes);

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
