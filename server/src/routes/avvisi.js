const express = require('express');

const Avviso = require('../models/Avviso');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { inviaTuttiDipendenti, inviaAdmin, escTG } = require('../utils/telegram');

const router = express.Router();

const PRIORITA_ICON = { normale: '📌', importante: '⚠️', urgente: '🚨' };

// Dipendente: solo gli avvisi attivi. Admin: tutti (anche archiviati), con
// ?attivo=true per filtrare comunque solo quelli attivi.
router.get('/', requireAuth, async (req, res) => {
  const filtro = {};
  if (req.user.ruolo !== 'admin' || req.query.attivo === 'true') filtro.attivo = true;
  res.json(await Avviso.find(filtro).sort({ creato_il: -1 }));
});

router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { titolo, testo, priorita } = req.body || {};
  if (!titolo || !testo) return res.status(400).json({ error: 'Titolo e testo sono obbligatori' });
  const avviso = await Avviso.create({ titolo, testo, priorita: priorita || 'normale', creato_da: req.user.id });

  const icona = PRIORITA_ICON[avviso.priorita] || '📌';
  await inviaTuttiDipendenti(`${icona} <b>Avviso</b>\n\n<b>${escTG(titolo)}</b>\n${escTG(testo)}`, '#avvisi');
  await inviaAdmin(`📢 Avviso pubblicato: <b>${escTG(titolo)}</b>`);

  res.status(201).json(avviso);
});

router.patch('/:id', requireAuth, requireAdmin, async (req, res) => {
  const { attivo } = req.body || {};
  const avviso = await Avviso.findByIdAndUpdate(req.params.id, { attivo }, { new: true });
  if (!avviso) return res.status(404).json({ error: 'Avviso non trovato' });
  res.json(avviso);
});

module.exports = router;
