const express = require('express');

const Acconto = require('../models/Acconto');
const Profilo = require('../models/Profilo');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { inviaDipendente, inviaAdmin, escTG } = require('../utils/telegram');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const { dipendente_id, mese, anno, daConfermare } = req.query;
  const filtro = {};
  if (req.user.ruolo === 'admin') {
    if (dipendente_id) filtro.dipendente_id = dipendente_id;
  } else {
    filtro.dipendente_id = req.user.id;
  }
  if (mese && anno) {
    const ultimoGiorno = new Date(parseInt(anno, 10), parseInt(mese, 10), 0).getDate();
    filtro.data = {
      $gte: `${anno}-${String(mese).padStart(2, '0')}-01`,
      $lte: `${anno}-${String(mese).padStart(2, '0')}-${String(ultimoGiorno).padStart(2, '0')}`,
    };
  }
  if (daConfermare === 'true') filtro.letto_dip = false;
  res.json(await Acconto.find(filtro).sort({ data: -1 }));
});

// Admin registra un acconto erogato a un dipendente.
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { dipendente_id, importo, data, note } = req.body || {};
  if (!dipendente_id || !importo || importo <= 0 || !data) {
    return res.status(400).json({ error: 'Dati mancanti o non validi' });
  }
  const acconto = await Acconto.create({ dipendente_id, importo, data, note, registrato_da: req.user.id });

  const profilo = await Profilo.findById(dipendente_id).select('nome cognome');
  const nomeDip = profilo ? profilo.nome + (profilo.cognome ? ' ' + profilo.cognome : '') : 'Dipendente';
  await inviaDipendente(
    dipendente_id,
    `💶 <b>Acconto ricevuto</b>\n\nHai ricevuto un acconto di <b>€ ${parseFloat(importo).toFixed(2)}</b> in data <b>${data}</b>.${note ? '\nNota: ' + escTG(note) : ''}\n\nConferma la ricezione aprendo l'app.`,
    '#stipendi'
  );
  await inviaAdmin(`✅ Acconto €${parseFloat(importo).toFixed(2)} registrato per ${escTG(nomeDip)} — in attesa di conferma dipendente.`);

  res.status(201).json(acconto);
});

// Dipendente conferma di aver ricevuto l'acconto.
router.patch('/:id/conferma', requireAuth, async (req, res) => {
  const acconto = await Acconto.findById(req.params.id);
  if (!acconto) return res.status(404).json({ error: 'Acconto non trovato' });
  if (acconto.dipendente_id.toString() !== req.user.id) return res.status(403).json({ error: 'Non autorizzato' });
  acconto.letto_dip = true;
  acconto.letto_il = new Date();
  await acconto.save();

  const profilo = await Profilo.findById(req.user.id).select('nome cognome');
  const nomeDip = profilo.nome + (profilo.cognome ? ' ' + profilo.cognome : '');
  await inviaAdmin(`✓✓ <b>Acconto confermato</b>\n${escTG(nomeDip)} ha confermato l'acconto di € ${parseFloat(acconto.importo).toFixed(2)} del ${acconto.data}.`);

  res.json(acconto);
});

module.exports = router;
