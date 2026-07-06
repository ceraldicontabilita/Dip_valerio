const express = require('express');
const fs = require('fs');

const Assenza = require('../models/Assenza');
const AssenzaAllegato = require('../models/AssenzaAllegato');
const Profilo = require('../models/Profilo');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { inviaDipendente, inviaAdmin, escTG } = require('../utils/telegram');
const { uploaderFor } = require('../utils/upload');

const router = express.Router();
const upload = uploaderFor('assenze');

// Lista filtrata. Admin: qualunque dipendente/stato. Dipendente: solo le proprie.
router.get('/', requireAuth, async (req, res) => {
  const { dipendente_id, stato, limit } = req.query;
  const filtro = {};
  if (req.user.ruolo === 'admin') {
    if (dipendente_id) filtro.dipendente_id = dipendente_id;
  } else {
    filtro.dipendente_id = req.user.id;
  }
  if (stato) filtro.stato = stato;
  let query = Assenza.find(filtro).sort({ creato_il: -1 });
  if (limit) query = query.limit(parseInt(limit, 10));
  res.json(await query);
});

// Admin: assenze approvate/confermate in un intervallo (per il cartellone
// "Presenze team"). Va prima di /:id per non essere intercettata da quella.
router.get('/periodo', requireAuth, requireAdmin, async (req, res) => {
  const { dal, al, stati } = req.query;
  const filtro = {
    data_inizio: { $lte: al },
    data_fine: { $gte: dal },
  };
  if (stati) filtro.stato = { $in: stati.split(',') };
  res.json(await Assenza.find(filtro));
});

router.get('/:id', requireAuth, async (req, res) => {
  const assenza = await Assenza.findById(req.params.id);
  if (!assenza) return res.status(404).json({ error: 'Richiesta non trovata' });
  if (req.user.ruolo !== 'admin' && assenza.dipendente_id.toString() !== req.user.id) {
    return res.status(403).json({ error: 'Non autorizzato' });
  }
  res.json(assenza);
});

// Dipendente: invia una nuova richiesta (ferie/malattia/acconto/altro).
router.post('/', requireAuth, async (req, res) => {
  const { tipo, data_inizio, data_fine, note, importo_richiesto, protocollo_inps } = req.body || {};
  if (!['ferie', 'malattia', 'acconto', 'altro'].includes(tipo)) {
    return res.status(400).json({ error: 'Tipo non valido' });
  }
  if (tipo !== 'acconto' && (!data_inizio || !data_fine)) {
    return res.status(400).json({ error: 'Inserisci le date' });
  }
  if (tipo === 'acconto' && !importo_richiesto) {
    return res.status(400).json({ error: 'Inserisci l\'importo richiesto' });
  }
  const profilo = await Profilo.findById(req.user.id).select('nome cognome');
  const nomeDipendente = profilo.nome + (profilo.cognome ? ' ' + profilo.cognome : '');

  const assenza = await Assenza.create({
    dipendente_id: req.user.id,
    nome_dipendente: nomeDipendente,
    tipo, note, importo_richiesto, protocollo_inps,
    data_inizio: tipo === 'acconto' ? undefined : data_inizio,
    data_fine: tipo === 'acconto' ? undefined : data_fine,
  });

  const titoli = { ferie: '🌴 Ferie', malattia: '🤒 Malattia', acconto: '💶 Acconto', altro: '📋 Altro' };
  let msg = `<b>📋 Nuova richiesta</b>\n\n<b>Dipendente:</b> ${escTG(nomeDipendente)}\n<b>Tipo:</b> ${titoli[tipo]}\n`;
  if (tipo === 'acconto') msg += `<b>Importo:</b> € ${parseFloat(importo_richiesto).toFixed(2)}\n`;
  else msg += `<b>Dal:</b> ${data_inizio}\n<b>Al:</b> ${data_fine}\n`;
  if (note) msg += `<b>Note:</b> ${escTG(note)}\n`;
  await inviaAdmin(msg);

  res.status(201).json(assenza);
});

// Admin assegna direttamente ferie/malattia/altro a un dipendente — il
// dipendente dovrà confermarla (stato admin_inviata).
router.post('/admin-invia', requireAuth, requireAdmin, async (req, res) => {
  const { dipendente_id, tipo, data_inizio, data_fine, note } = req.body || {};
  if (!dipendente_id || !data_inizio || !data_fine) return res.status(400).json({ error: 'Dati mancanti' });
  const profilo = await Profilo.findById(dipendente_id).select('nome cognome');
  if (!profilo) return res.status(404).json({ error: 'Dipendente non trovato' });
  const nomeDipendente = profilo.nome + (profilo.cognome ? ' ' + profilo.cognome : '');

  const assenza = await Assenza.create({
    dipendente_id, nome_dipendente: nomeDipendente, tipo, data_inizio, data_fine, note,
    stato: 'admin_inviata', invia_da_admin: true, creato_da_admin: req.user.id,
  });

  const icone = { ferie: '🌴', malattia: '🤒', altro: '📋' };
  await inviaDipendente(
    dipendente_id,
    `<b>${icone[tipo] || '📋'} Nuova assenza assegnata</b>\n\nL'admin ha registrato una ${tipo} per te.\nDal: <b>${data_inizio}</b>\nAl: <b>${data_fine}</b>${note ? '\nNote: ' + escTG(note) : ''}`,
    '#richieste'
  );

  res.status(201).json(assenza);
});

// Admin approva/rifiuta una richiesta del dipendente.
router.patch('/:id/rispondi', requireAuth, requireAdmin, async (req, res) => {
  const { stato, nota_admin } = req.body || {}; // 'approvata' | 'rifiutata'
  const assenza = await Assenza.findByIdAndUpdate(req.params.id, { stato, nota_admin }, { new: true });
  if (!assenza) return res.status(404).json({ error: 'Richiesta non trovata' });

  const esito = stato === 'approvata' ? '✅ Approvata' : '❌ Rifiutata';
  let msg = `<b>Richiesta ${esito}</b>\n\nLa tua richiesta di ${assenza.tipo} è stata <b>${esito}</b>.`;
  if (nota_admin) msg += `\n\nNota admin: ${escTG(nota_admin)}`;
  await inviaDipendente(assenza.dipendente_id, msg, '#assenze');

  res.json(assenza);
});

// Dipendente conferma/rifiuta una assenza assegnata dall'admin.
router.patch('/:id/rispondi-dipendente', requireAuth, async (req, res) => {
  const { stato } = req.body || {}; // 'confermata' | 'rifiutata'
  const assenza = await Assenza.findById(req.params.id);
  if (!assenza) return res.status(404).json({ error: 'Richiesta non trovata' });
  if (assenza.dipendente_id.toString() !== req.user.id) return res.status(403).json({ error: 'Non autorizzato' });
  assenza.stato = stato;
  await assenza.save();

  const nomeDip = assenza.nome_dipendente;
  const esito = stato === 'confermata'
    ? `✅ <b>${escTG(nomeDip)} ha confermato</b> la richiesta di ${assenza.tipo}.`
    : `❌ <b>${escTG(nomeDip)} ha rifiutato</b> la richiesta di ${assenza.tipo}.`;
  await inviaAdmin(esito);

  res.json(assenza);
});

router.patch('/:id', requireAuth, async (req, res) => {
  const assenza = await Assenza.findById(req.params.id);
  if (!assenza) return res.status(404).json({ error: 'Richiesta non trovata' });
  if (req.user.ruolo !== 'admin' && assenza.dipendente_id.toString() !== req.user.id) {
    return res.status(403).json({ error: 'Non autorizzato' });
  }
  if (req.user.ruolo !== 'admin' && assenza.stato !== 'in attesa') {
    return res.status(409).json({ error: 'Non è più modificabile' });
  }
  const campi = ['tipo', 'data_inizio', 'data_fine', 'note', 'importo_richiesto'];
  campi.forEach((c) => { if (req.body[c] !== undefined) assenza[c] = req.body[c]; });
  await assenza.save();
  res.json(assenza);
});

router.delete('/:id', requireAuth, async (req, res) => {
  const assenza = await Assenza.findById(req.params.id);
  if (!assenza) return res.status(404).json({ error: 'Richiesta non trovata' });
  if (req.user.ruolo !== 'admin' && assenza.dipendente_id.toString() !== req.user.id) {
    return res.status(403).json({ error: 'Non autorizzato' });
  }
  await AssenzaAllegato.deleteMany({ assenza_id: assenza._id });
  await assenza.deleteOne();
  res.json({ ok: true });
});

// --- Allegati (certificati, foto) ---

router.get('/:id/allegati', requireAuth, async (req, res) => {
  const assenza = await Assenza.findById(req.params.id);
  if (!assenza) return res.status(404).json({ error: 'Richiesta non trovata' });
  if (req.user.ruolo !== 'admin' && assenza.dipendente_id.toString() !== req.user.id) {
    return res.status(403).json({ error: 'Non autorizzato' });
  }
  res.json(await AssenzaAllegato.find({ assenza_id: assenza._id }));
});

router.post('/:id/allegati', requireAuth, upload.array('files', 10), async (req, res) => {
  const assenza = await Assenza.findById(req.params.id);
  if (!assenza) return res.status(404).json({ error: 'Richiesta non trovata' });
  if (req.user.ruolo !== 'admin' && assenza.dipendente_id.toString() !== req.user.id) {
    return res.status(403).json({ error: 'Non autorizzato' });
  }
  const allegati = await Promise.all(
    (req.files || []).map((f) =>
      AssenzaAllegato.create({ assenza_id: assenza._id, nome_file: f.originalname, url: f.path })
    )
  );
  res.status(201).json(allegati);
});

router.get('/:id/allegati/:allegatoId/file', requireAuth, async (req, res) => {
  const assenza = await Assenza.findById(req.params.id);
  if (!assenza) return res.status(404).json({ error: 'Richiesta non trovata' });
  if (req.user.ruolo !== 'admin' && assenza.dipendente_id.toString() !== req.user.id) {
    return res.status(403).json({ error: 'Non autorizzato' });
  }
  const allegato = await AssenzaAllegato.findOne({ _id: req.params.allegatoId, assenza_id: assenza._id });
  if (!allegato || !fs.existsSync(allegato.url)) return res.status(404).json({ error: 'File non trovato' });
  res.download(allegato.url, allegato.nome_file);
});

module.exports = router;
