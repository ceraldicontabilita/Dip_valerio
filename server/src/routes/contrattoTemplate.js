const express = require('express');

const ContrattoTemplate = require('../models/ContrattoTemplate');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Singleton: un solo documento di contratto in tutto il sistema.
router.get('/', requireAuth, async (req, res) => {
  const tpl = await ContrattoTemplate.findOne();
  res.json(tpl || null);
});

router.put('/', requireAuth, requireAdmin, async (req, res) => {
  const { testo, versione } = req.body || {};
  if (!testo || !versione) return res.status(400).json({ error: 'Testo e versione sono obbligatori' });
  const tpl = await ContrattoTemplate.findOneAndUpdate(
    {},
    { testo, versione, aggiornato_da: req.user.id },
    { new: true, upsert: true }
  );
  res.json(tpl);
});

module.exports = router;
