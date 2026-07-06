const express = require('express');

const { requireAuth, requireAdmin } = require('../middleware/auth');
const { inviaAdmin, inviaDipendente, inviaTuttiDipendenti } = require('../utils/telegram');

const router = express.Router();

// Relay generico per notifiche Telegram "ad-hoc" innescate dalla dashboard
// admin (promemoria, riepiloghi, solleciti) che non corrispondono a una
// singola azione CRUD già notificata automaticamente da un'altra route.
// Solo l'admin può usarlo, e i token dei bot restano sempre lato server.
router.post('/notifica-admin', requireAuth, requireAdmin, async (req, res) => {
  await inviaAdmin(req.body?.testo || '');
  res.json({ ok: true });
});

router.post('/notifica-dipendente', requireAuth, requireAdmin, async (req, res) => {
  const { dipendente_id, testo, deepLink } = req.body || {};
  if (!dipendente_id) return res.status(400).json({ error: 'dipendente_id obbligatorio' });
  await inviaDipendente(dipendente_id, testo || '', deepLink);
  res.json({ ok: true });
});

router.post('/notifica-tutti', requireAuth, requireAdmin, async (req, res) => {
  const { testo, deepLink } = req.body || {};
  await inviaTuttiDipendenti(testo || '', deepLink);
  res.json({ ok: true });
});

module.exports = router;
