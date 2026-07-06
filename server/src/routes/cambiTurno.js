const express = require('express');

const CambioTurno = require('../models/CambioTurno');
const Profilo = require('../models/Profilo');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { inviaDipendente, inviaAdmin, escTG } = require('../utils/telegram');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const { stato, limit } = req.query;
  const filtro = {};
  if (stato) filtro.stato = stato;
  if (req.user.ruolo !== 'admin') {
    filtro.$or = [{ richiedente_id: req.user.id }, { collega_id: req.user.id }];
  }
  let query = CambioTurno.find(filtro).sort({ createdAt: -1 });
  if (limit) query = query.limit(parseInt(limit, 10));
  res.json(await query);
});

router.get('/:id', requireAuth, async (req, res) => {
  const cambio = await CambioTurno.findById(req.params.id);
  if (!cambio) return res.status(404).json({ error: 'Cambio turno non trovato' });
  if (
    req.user.ruolo !== 'admin' &&
    cambio.richiedente_id.toString() !== req.user.id &&
    cambio.collega_id.toString() !== req.user.id
  ) {
    return res.status(403).json({ error: 'Non autorizzato' });
  }
  res.json(cambio);
});

// Dipendente propone uno scambio turno a un collega — parte in attesa del collega.
router.post('/', requireAuth, async (req, res) => {
  const { collega_id, data_turno, fascia_oraria, note } = req.body || {};
  if (!collega_id || !data_turno || !fascia_oraria) return res.status(400).json({ error: 'Dati mancanti' });

  const [richiedente, collega] = await Promise.all([
    Profilo.findById(req.user.id).select('nome cognome'),
    Profilo.findById(collega_id).select('nome cognome'),
  ]);
  if (!collega) return res.status(404).json({ error: 'Collega non trovato' });

  const nomeRichiedente = richiedente.nome + (richiedente.cognome ? ' ' + richiedente.cognome : '');
  const nomeCollega = collega.nome + (collega.cognome ? ' ' + collega.cognome : '');

  const cambio = await CambioTurno.create({
    richiedente_id: req.user.id, nome_richiedente: nomeRichiedente,
    collega_id, nome_collega: nomeCollega,
    data_turno, fascia_oraria, note,
    stato: 'attesa_collega', collega_stato: 'in attesa',
  });

  await inviaDipendente(
    collega_id,
    `🔄 <b>Richiesta cambio turno</b>\n\n<b>${escTG(nomeRichiedente)}</b> ti chiede di scambiare il turno del <b>${data_turno}</b>\n⏰ Fascia: <b>${escTG(fascia_oraria)}</b>${note ? '\n\nNote: ' + escTG(note) : ''}\n\nApri l'app per accettare o rifiutare.`,
    '#assenze'
  );

  res.status(201).json(cambio);
});

// Il collega coinvolto accetta o rifiuta.
router.patch('/:id/collega', requireAuth, async (req, res) => {
  const { esito } = req.body || {}; // 'accettata' | 'rifiutata'
  const cambio = await CambioTurno.findById(req.params.id);
  if (!cambio) return res.status(404).json({ error: 'Cambio turno non trovato' });
  if (cambio.collega_id.toString() !== req.user.id) return res.status(403).json({ error: 'Non autorizzato' });

  cambio.collega_stato = esito;
  cambio.collega_risposto_il = new Date();
  cambio.stato = esito === 'accettata' ? 'attesa_admin' : 'rifiutata_collega';
  await cambio.save();

  if (esito === 'accettata') {
    await inviaDipendente(
      cambio.richiedente_id,
      `🔄 <b>${escTG(cambio.nome_collega)} ha accettato</b>\n\nIl cambio turno del ${cambio.data_turno} è ora in attesa di approvazione dall'amministratore.`,
      '#assenze'
    );
    await inviaAdmin(
      `🔄 <b>Cambio turno da approvare</b>\n\n<b>${escTG(cambio.nome_richiedente)}</b> ↔ <b>${escTG(cambio.nome_collega)}</b> — entrambi d'accordo.\nTurno del <b>${cambio.data_turno}</b> (${escTG(cambio.fascia_oraria)})`
    );
  } else {
    await inviaDipendente(
      cambio.richiedente_id,
      `🔄 <b>${escTG(cambio.nome_collega)} ha rifiutato</b>\n\nIl cambio turno del ${cambio.data_turno} non è stato accettato dal collega.`,
      '#assenze'
    );
  }

  res.json(cambio);
});

// Admin approva/rifiuta definitivamente (dopo l'ok del collega).
router.patch('/:id/admin', requireAuth, requireAdmin, async (req, res) => {
  const { esito } = req.body || {}; // 'approvata' | 'rifiutata'
  const cambio = await CambioTurno.findByIdAndUpdate(
    req.params.id,
    { stato: esito, risposto_il: new Date() },
    { new: true }
  );
  if (!cambio) return res.status(404).json({ error: 'Cambio turno non trovato' });

  const esitoLbl = esito === 'approvata' ? '✅ approvato' : '❌ rifiutato';
  const msg = `🔄 <b>Cambio turno ${esitoLbl}</b>\n\nIl cambio turno del ${cambio.data_turno} (${escTG(cambio.fascia_oraria)}) è stato ${esitoLbl} dall'amministratore.`;
  await inviaDipendente(cambio.richiedente_id, msg);
  await inviaDipendente(cambio.collega_id, msg);

  res.json(cambio);
});

// Solo chi ha fatto la richiesta può ritirarla, finché non è stata decisa.
router.delete('/:id', requireAuth, async (req, res) => {
  const cambio = await CambioTurno.findById(req.params.id);
  if (!cambio) return res.status(404).json({ error: 'Cambio turno non trovato' });
  if (req.user.ruolo !== 'admin' && cambio.richiedente_id.toString() !== req.user.id) {
    return res.status(403).json({ error: 'Non autorizzato' });
  }
  await cambio.deleteOne();
  await inviaAdmin(`🔄 <b>Richiesta cambio turno ritirata</b>\n\n${escTG(cambio.nome_richiedente)} ha annullato la richiesta del ${cambio.data_turno} con ${escTG(cambio.nome_collega)}.`);
  res.json({ ok: true });
});

module.exports = router;
