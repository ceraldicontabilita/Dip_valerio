const express = require('express');
const crypto = require('crypto');
const Profilo = require('../models/Profilo');
const Otp = require('../models/Otp');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { inviaDipendente, inviaAdmin, escTG } = require('../utils/telegram');

const router = express.Router();

function pubblico(p) {
  const obj = p.toObject ? p.toObject() : p;
  delete obj.password_hash;
  return obj;
}

// Admin: lista completa (con filtro stato) per la sezione Team.
// Dipendente: solo elenco leggero dei colleghi attivi (per il cambio turno).
router.get('/', requireAuth, async (req, res) => {
  if (req.user.ruolo === 'admin') {
    const stato = req.query.stato || 'attivi';
    const filtro = { ruolo: 'dipendente' };
    if (stato === 'attivi') filtro.eliminato = false;
    if (stato === 'eliminati') filtro.eliminato = true;
    const profili = await Profilo.find(filtro).sort({ nome: 1 });
    return res.json(profili.map(pubblico));
  }
  const colleghi = await Profilo.find({
    ruolo: 'dipendente',
    attivo: true,
    eliminato: false,
    _id: { $ne: req.user.id },
  })
    .select('nome cognome')
    .sort({ nome: 1 });
  res.json(colleghi);
});

router.get('/:id', requireAuth, async (req, res) => {
  if (req.user.ruolo !== 'admin' && req.user.id !== req.params.id) {
    return res.status(403).json({ error: 'Non autorizzato' });
  }
  const profilo = await Profilo.findById(req.params.id);
  if (!profilo) return res.status(404).json({ error: 'Profilo non trovato' });
  res.json(pubblico(profilo));
});

// Admin: modifica scheda anagrafica/contrattuale completa.
router.patch('/:id', requireAuth, requireAdmin, async (req, res) => {
  const campiAmmessi = [
    'nome', 'cognome', 'data_nascita', 'codice_fiscale', 'telefono',
    'data_assunzione', 'paga_giornaliera', 'tipo_contratto', 'scadenza_contratto',
    'livello_ccnl', 'mansione', 'indirizzo', 'iban', 'ferie_annuali', 'permessi_annui',
  ];
  const patch = {};
  for (const campo of campiAmmessi) {
    if (req.body[campo] !== undefined) patch[campo] = req.body[campo];
  }
  const profilo = await Profilo.findByIdAndUpdate(req.params.id, patch, { new: true });
  if (!profilo) return res.status(404).json({ error: 'Profilo non trovato' });
  res.json(pubblico(profilo));
});

// Admin: disattiva un dipendente (soft delete) — scollega anche Telegram.
router.post('/:id/elimina', requireAuth, requireAdmin, async (req, res) => {
  const profilo = await Profilo.findById(req.params.id);
  if (!profilo) return res.status(404).json({ error: 'Profilo non trovato' });
  const chatIdPrecedente = profilo.telegram_chat_id;
  profilo.attivo = false;
  profilo.eliminato = true;
  profilo.eliminato_il = new Date();
  profilo.telegram_chat_id = null;
  profilo.tg_link_code = null;
  await profilo.save();

  if (chatIdPrecedente) {
    profilo.telegram_chat_id = chatIdPrecedente; // solo per l'invio del messaggio di congedo
    await inviaDipendente(
      profilo._id,
      'Il tuo accesso all\'app è stato disattivato dall\'amministratore.\nPer informazioni contatta Ceraldi Group S.r.l.'
    ).catch(() => {});
    profilo.telegram_chat_id = null;
  }
  await inviaAdmin(`<b>Dipendente eliminato</b>\n\n${escTG(profilo.nome)} è stato rimosso dal team.`).catch(() => {});
  res.json({ ok: true });
});

router.post('/:id/ripristina', requireAuth, requireAdmin, async (req, res) => {
  const profilo = await Profilo.findByIdAndUpdate(
    req.params.id,
    { attivo: true, eliminato: false, eliminato_il: null },
    { new: true }
  );
  if (!profilo) return res.status(404).json({ error: 'Profilo non trovato' });
  res.json(pubblico(profilo));
});

// --- Collegamento Telegram (onboarding + profilo) ---

// Genera un codice di collegamento da passare al bot come /start <code>.
router.post('/me/telegram/avvia', requireAuth, async (req, res) => {
  const codice = crypto.randomInt(100000, 999999).toString();
  await Profilo.findByIdAndUpdate(req.user.id, { tg_link_code: codice });
  res.json({ codice });
});

router.get('/me/telegram/stato', requireAuth, async (req, res) => {
  const profilo = await Profilo.findById(req.user.id).select('telegram_chat_id');
  res.json({ collegato: !!profilo?.telegram_chat_id });
});

router.post('/me/telegram/scollega', requireAuth, async (req, res) => {
  await Profilo.findByIdAndUpdate(req.user.id, { telegram_chat_id: null, tg_link_code: null });
  res.json({ ok: true });
});

// --- Certificazione contatti (telefono/email) via OTP Telegram ---

async function inviaOtpCertifica(profilo, tipo) {
  const valore = tipo === 'tel' ? profilo.telefono : profilo.email;
  if (!valore) throw new Error(`Nessun ${tipo === 'tel' ? 'numero' : 'indirizzo email'} da certificare`);
  const codice = crypto.randomInt(100000, 999999).toString();
  const expires_at = new Date(Date.now() + 15 * 60 * 1000);
  await Otp.create({
    dipendente_id: profilo._id,
    codice,
    tipo: tipo === 'tel' ? 'cert_tel' : 'cert_email',
    expires_at,
  });
  await inviaDipendente(
    profilo._id,
    `🔐 <b>Verifica contatto</b>\n\nStai certificando: <b>${escTG(valore)}</b>\n\nCodice OTP: <b>${codice}</b>\n\n<i>Valido 15 minuti.</i>`
  );
  return codice;
}

// Admin richiede la certificazione di telefono o email di un dipendente.
router.post('/:id/certifica', requireAuth, requireAdmin, async (req, res) => {
  const { tipo } = req.body || {}; // 'tel' | 'email'
  const profilo = await Profilo.findById(req.params.id);
  if (!profilo) return res.status(404).json({ error: 'Profilo non trovato' });
  try {
    const codice = await inviaOtpCertifica(profilo, tipo);
    res.json({ inviato: true, codiceAdmin: codice }); // mostrato all'admin come promemoria
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Dipendente richiede la certificazione del proprio contatto (onboarding).
router.post('/me/certifica', requireAuth, async (req, res) => {
  const { tipo } = req.body || {};
  const profilo = await Profilo.findById(req.user.id);
  try {
    await inviaOtpCertifica(profilo, tipo);
    res.json({ inviato: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Dipendente inserisce il codice ricevuto per certificare tel/email.
router.post('/me/verifica-certificazione', requireAuth, async (req, res) => {
  const { tipo, codice } = req.body || {};
  const tipoOtp = tipo === 'tel' ? 'cert_tel' : 'cert_email';
  const otp = await Otp.findOne({
    dipendente_id: req.user.id,
    tipo: tipoOtp,
    used: false,
    expires_at: { $gt: new Date() },
  }).sort({ createdAt: -1 });
  if (!otp || otp.codice !== codice) return res.status(400).json({ error: 'Codice errato o scaduto' });
  otp.used = true;
  await otp.save();
  const campo = tipo === 'tel' ? 'tel_certificato_il' : 'email_certificato_il';
  const patch = { [campo]: new Date() };
  // La certificazione del telefono è l'ultimo passo dell'onboarding di un
  // nuovo dipendente registrato da invito: sblocca l'accesso all'app.
  const eraDisattivo = tipo === 'tel';
  if (eraDisattivo) patch.attivo = true;
  const profilo = await Profilo.findByIdAndUpdate(req.user.id, patch, { new: true });

  if (eraDisattivo) {
    await inviaAdmin(
      `<b>Nuovo dipendente registrato</b>\n\n<b>${escTG(profilo.nome)} ${escTG(profilo.cognome || '')}</b>\nEmail: ${escTG(profilo.email)}\nTel: ${escTG(profilo.telefono || '')}\nCF: ${escTG(profilo.codice_fiscale || '')}\nIndirizzo: ${escTG(profilo.indirizzo || '')}\n\nCompleta la scheda con mansione, livello e paga.`
    ).catch(() => {});
  }

  const obj = profilo.toObject();
  delete obj.password_hash;
  res.json(obj);
});

// Dipendente accetta privacy + contratto (primo accesso o aggiornamento versione).
router.post('/me/accetta-privacy', requireAuth, async (req, res) => {
  const { privacy_versione, contratto_versione } = req.body || {};
  const ora = new Date();
  const profilo = await Profilo.findByIdAndUpdate(
    req.user.id,
    {
      privacy_accettata: true,
      privacy_accettata_il: ora,
      privacy_versione,
      contratto_accettato_il: ora,
      contratto_versione,
      primo_accesso: false,
    },
    { new: true }
  );
  res.json(pubblico(profilo));
});

// Admin conferma la certificazione manualmente, senza attendere l'OTP.
router.post('/:id/certifica-conferma', requireAuth, requireAdmin, async (req, res) => {
  const { tipo } = req.body || {};
  const campo = tipo === 'tel' ? 'tel_certificato_il' : 'email_certificato_il';
  const profilo = await Profilo.findByIdAndUpdate(req.params.id, { [campo]: new Date() }, { new: true });
  if (!profilo) return res.status(404).json({ error: 'Profilo non trovato' });
  res.json(pubblico(profilo));
});

module.exports = router;
