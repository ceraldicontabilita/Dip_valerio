const express = require('express');
const crypto = require('crypto');

const Presenza = require('../models/Presenza');
const Otp = require('../models/Otp');
const Correzione = require('../models/Correzione');
const Profilo = require('../models/Profilo');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { inviaDipendente, inviaAdmin, escTG } = require('../utils/telegram');

const router = express.Router();

function oggiISO() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// Admin: tutte le presenze di oggi. Dipendente: solo la propria (se esiste).
router.get('/oggi', requireAuth, async (req, res) => {
  if (req.user.ruolo === 'admin') {
    const presenze = await Presenza.find({ data: oggiISO() }).sort({ ts_entrata: 1 });
    return res.json(presenze);
  }
  const presenza = await Presenza.findOne({ dipendente_id: req.user.id, data: oggiISO() });
  res.json(presenza || null);
});

// Storico filtrato per periodo. Admin: qualunque dipendente_id (o tutti).
// Dipendente: forzato a se stesso.
router.get('/', requireAuth, async (req, res) => {
  const { dal, al, dipendente_id, limit } = req.query;
  const filtro = {};
  if (dal || al) {
    filtro.data = {};
    if (dal) filtro.data.$gte = dal;
    if (al) filtro.data.$lte = al;
  }
  if (req.user.ruolo === 'admin') {
    if (dipendente_id) filtro.dipendente_id = dipendente_id;
  } else {
    filtro.dipendente_id = req.user.id;
  }
  let query = Presenza.find(filtro).sort({ data: -1, ts_entrata: -1 });
  if (limit) query = query.limit(parseInt(limit, 10));
  res.json(await query);
});

// Statistiche dashboard admin (presenti oggi, turni mese, costo mese).
router.get('/stats', requireAuth, requireAdmin, async (req, res) => {
  const oggi = oggiISO();
  const [anno, mese] = (req.query.mese || oggi.slice(0, 7)).split('-').map(Number);
  const ultimoGiorno = new Date(anno, mese, 0).getDate();
  const dal = `${anno}-${String(mese).padStart(2, '0')}-01`;
  const al = `${anno}-${String(mese).padStart(2, '0')}-${String(ultimoGiorno).padStart(2, '0')}`;

  const [presentiOggi, presenzeMese, dipendenti] = await Promise.all([
    Presenza.countDocuments({ data: oggi }),
    Presenza.find({ data: { $gte: dal, $lte: al } }).select('dipendente_id'),
    Profilo.find({ ruolo: 'dipendente', attivo: true }).select('paga_giornaliera'),
  ]);
  const pagaMap = {};
  dipendenti.forEach((d) => { pagaMap[d._id.toString()] = parseFloat(d.paga_giornaliera) || 0; });
  const costoMese = presenzeMese.reduce((s, p) => s + (pagaMap[p.dipendente_id.toString()] || 0), 0);

  res.json({ presentiOggi, turniMese: presenzeMese.length, costoMese });
});

router.get('/:id', requireAuth, async (req, res) => {
  const presenza = await Presenza.findById(req.params.id);
  if (!presenza) return res.status(404).json({ error: 'Presenza non trovata' });
  if (req.user.ruolo !== 'admin' && presenza.dipendente_id.toString() !== req.user.id) {
    return res.status(403).json({ error: 'Non autorizzato' });
  }
  res.json(presenza);
});

// Crea una timbratura. Admin: QR scansionato o manuale per un dipendente.
// Dipendente: registrazione manuale della propria presenza (da confermare).
router.post('/', requireAuth, async (req, res) => {
  const isAdmin = req.user.ruolo === 'admin';
  const data = (isAdmin && req.body.data) || oggiISO();
  const dipendenteId = isAdmin ? req.body.dipendente_id : req.user.id;
  if (!dipendenteId) return res.status(400).json({ error: 'dipendente_id obbligatorio' });

  const giaPresente = await Presenza.findOne({ dipendente_id: dipendenteId, data });
  if (giaPresente) return res.status(409).json({ error: 'Dipendente già timbrato in questa data' });

  const profilo = await Profilo.findById(dipendenteId).select('nome cognome');
  if (!profilo) return res.status(404).json({ error: 'Dipendente non trovato' });
  const nomeDipendente = profilo.nome + (profilo.cognome ? ' ' + profilo.cognome : '');

  let tipo_timbratura = 'qr';
  let confermata_dip = true;
  let motivo_manuale;

  if (!isAdmin) {
    tipo_timbratura = 'manuale_dip';
    confermata_dip = false;
    motivo_manuale = req.body.motivo_manuale;
    if (!motivo_manuale) return res.status(400).json({ error: 'La motivazione è obbligatoria' });
  } else if (req.body.tipo === 'manuale') {
    tipo_timbratura = 'manuale';
    confermata_dip = false;
    motivo_manuale = req.body.motivo_manuale;
    if (!motivo_manuale) return res.status(400).json({ error: 'La motivazione è obbligatoria' });
  }

  const presenza = await Presenza.create({
    dipendente_id: dipendenteId,
    nome_dipendente: nomeDipendente,
    data,
    ts_entrata: req.body.ts_entrata ? new Date(req.body.ts_entrata) : new Date(),
    note: req.body.note || undefined,
    registrato_da: req.user.id,
    tipo_timbratura,
    motivo_manuale,
    confermata_dip,
  });

  if (tipo_timbratura === 'manuale') {
    await inviaDipendente(
      dipendenteId,
      `📋 <b>Timbratura manuale registrata</b>\n\nL'amministratore ha registrato una presenza per te il ${data}.\n📝 Motivo: ${escTG(motivo_manuale)}\n\nApri l'app per confermarla.`
    );
  }

  res.status(201).json(presenza);
});

// Admin: modifica orario di uscita/note (dettaglio presenza, non è una
// correzione contestabile — non richiede motivo).
router.patch('/:id/dettaglio', requireAuth, requireAdmin, async (req, res) => {
  const patch = {};
  if (req.body.ts_uscita !== undefined) patch.ts_uscita = req.body.ts_uscita ? new Date(req.body.ts_uscita) : null;
  if (req.body.note !== undefined) patch.note = req.body.note;
  const presenza = await Presenza.findByIdAndUpdate(req.params.id, patch, { new: true });
  if (!presenza) return res.status(404).json({ error: 'Presenza non trovata' });
  res.json(presenza);
});

// Admin: correzione di entrata/data — richiede motivo, viene loggata.
router.patch('/:id/correggi', requireAuth, requireAdmin, async (req, res) => {
  const { data, ts_entrata, motivo } = req.body || {};
  if (!motivo) return res.status(400).json({ error: 'Il motivo è obbligatorio' });
  const presenza = await Presenza.findById(req.params.id);
  if (!presenza) return res.status(404).json({ error: 'Presenza non trovata' });

  await Correzione.create({
    presenza_id: presenza._id,
    dipendente_id: presenza.dipendente_id,
    azione: 'modifica',
    motivo,
    dati_prima: { data: presenza.data, ts_entrata: presenza.ts_entrata },
    eseguita_da: req.user.id,
  });

  if (data) presenza.data = data;
  if (ts_entrata) presenza.ts_entrata = new Date(ts_entrata);
  await presenza.save();
  res.json(presenza);
});

// Admin: elimina una timbratura — richiede motivo, viene loggata.
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  const { motivo } = req.body || {};
  if (!motivo) return res.status(400).json({ error: 'Il motivo è obbligatorio' });
  const presenza = await Presenza.findById(req.params.id);
  if (!presenza) return res.status(404).json({ error: 'Presenza non trovata' });

  await Correzione.create({
    presenza_id: presenza._id,
    dipendente_id: presenza.dipendente_id,
    azione: 'eliminazione',
    motivo,
    dati_prima: presenza.toObject(),
    eseguita_da: req.user.id,
  });
  await presenza.deleteOne();
  res.json({ ok: true });
});

// Admin: approva/rifiuta una timbratura "manuale_dip" (registrata dal
// dipendente stesso) — nessun OTP richiesto, decisione diretta dell'admin.
router.post('/:id/approva', requireAuth, requireAdmin, async (req, res) => {
  const { approva } = req.body || {};
  const presenza = await Presenza.findById(req.params.id);
  if (!presenza) return res.status(404).json({ error: 'Presenza non trovata' });
  if (approva) {
    presenza.confermata_dip = true;
    await presenza.save();
  } else {
    await presenza.deleteOne();
  }
  res.json({ ok: true });
});

// Dipendente: genera un codice OTP per una timbratura "manuale" (registrata
// dall'admin) da comunicare a voce all'admin per farla confermare.
router.post('/:id/genera-otp', requireAuth, async (req, res) => {
  const presenza = await Presenza.findById(req.params.id);
  if (!presenza) return res.status(404).json({ error: 'Presenza non trovata' });
  if (presenza.dipendente_id.toString() !== req.user.id) return res.status(403).json({ error: 'Non autorizzato' });

  await Otp.updateMany({ presenza_id: presenza._id, dipendente_id: req.user.id }, { used: true });
  const codice = crypto.randomInt(100000, 999999).toString();
  const expires_at = new Date(Date.now() + 10 * 60 * 1000);
  await Otp.create({ presenza_id: presenza._id, dipendente_id: req.user.id, codice, expires_at });
  res.json({ codice });
});

// Admin: verifica il codice OTP dettato dal dipendente e conferma la presenza.
router.post('/:id/verifica-otp', requireAuth, requireAdmin, async (req, res) => {
  const { codice } = req.body || {};
  const otp = await Otp.findOne({
    presenza_id: req.params.id,
    used: false,
    expires_at: { $gt: new Date() },
  }).sort({ createdAt: -1 });
  if (!otp || otp.codice !== codice) return res.status(400).json({ error: 'Codice errato o scaduto' });
  otp.used = true;
  await otp.save();
  const presenza = await Presenza.findByIdAndUpdate(req.params.id, { confermata_dip: true }, { new: true });
  if (!presenza) return res.status(404).json({ error: 'Presenza non trovata' });
  res.json(presenza);
});

module.exports = router;
