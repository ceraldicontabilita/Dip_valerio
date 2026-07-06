const express = require('express');

const Liquidazione = require('../models/Liquidazione');
const Profilo = require('../models/Profilo');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { inviaDipendente, inviaAdmin, escTG } = require('../utils/telegram');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const { dipendente_id, mese, anno, daConfermare } = req.query;
  const filtro = {};
  if (req.user.ruolo === 'admin') {
    if (dipendente_id) filtro.dipendente_id = dipendente_id;
    if (mese) filtro.mese = parseInt(mese, 10);
    if (anno) filtro.anno = parseInt(anno, 10);
  } else {
    filtro.dipendente_id = req.user.id;
  }
  if (daConfermare === 'true') filtro.confermata_dip = false;
  res.json(await Liquidazione.find(filtro).sort({ anno: -1, mese: -1 }));
});

// Admin segna un mese come liquidato per un dipendente (un solo record per
// dipendente/mese/anno, come il vincolo unico dell'app originale).
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { dipendente_id, anno, mese, giorni, importo_lordo, acconti, importo_netto, note } = req.body || {};
  if (!dipendente_id || !anno || !mese) return res.status(400).json({ error: 'Dati mancanti' });

  let liquidazione;
  try {
    liquidazione = await Liquidazione.create({
      dipendente_id, anno, mese, giorni, importo_lordo, acconti, importo_netto, note,
      liquidato_da: req.user.id,
    });
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ error: 'Mese già liquidato per questo dipendente' });
    throw e;
  }

  const profilo = await Profilo.findById(dipendente_id).select('nome cognome');
  const nomeDip = profilo ? profilo.nome + (profilo.cognome ? ' ' + profilo.cognome : '') : 'Dipendente';
  const meseLbl = new Date(anno, mese - 1, 1).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
  await inviaDipendente(
    dipendente_id,
    `💶 <b>Stipendio accreditato</b>\n\nIl tuo stipendio di <b>${meseLbl}</b> è stato pagato.\nImporto netto: <b>€ ${parseFloat(importo_netto).toFixed(2)}</b>${note ? '\nNota: ' + escTG(note) : ''}\n\nConferma la ricezione aprendo l'app.`,
    '#stipendi'
  );
  await inviaAdmin(`💶 Stipendio <b>${meseLbl}</b> segnato per <b>${escTG(nomeDip)}</b> — € ${parseFloat(importo_netto).toFixed(2)} — in attesa conferma.`);

  res.status(201).json(liquidazione);
});

router.patch('/:id/conferma', requireAuth, async (req, res) => {
  const liquidazione = await Liquidazione.findById(req.params.id);
  if (!liquidazione) return res.status(404).json({ error: 'Liquidazione non trovata' });
  if (liquidazione.dipendente_id.toString() !== req.user.id) return res.status(403).json({ error: 'Non autorizzato' });
  liquidazione.confermata_dip = true;
  liquidazione.confermata_il = new Date();
  await liquidazione.save();

  const profilo = await Profilo.findById(req.user.id).select('nome cognome');
  const nomeDip = profilo.nome + (profilo.cognome ? ' ' + profilo.cognome : '');
  const meseLbl = new Date(liquidazione.anno, liquidazione.mese - 1, 1).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
  await inviaAdmin(`✓✓ <b>Stipendio confermato</b>\n${escTG(nomeDip)} ha confermato lo stipendio di <b>${meseLbl}</b> (€ ${parseFloat(liquidazione.importo_netto).toFixed(2)})`);

  res.json(liquidazione);
});

module.exports = router;
