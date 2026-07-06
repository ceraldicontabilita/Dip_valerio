const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const Profilo = require('../models/Profilo');
const Invito = require('../models/Invito');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

function signToken(profilo) {
  return jwt.sign(
    { id: profilo._id.toString(), ruolo: profilo.ruolo, email: profilo.email, nome: profilo.nome },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
}

function profiloPubblico(p) {
  const obj = p.toObject ? p.toObject() : p;
  delete obj.password_hash;
  return obj;
}

// Sostituisce sb.auth.signInWithPassword(...)
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email e password obbligatorie' });
  const profilo = await Profilo.findOne({ email: email.toLowerCase().trim() });
  if (!profilo) return res.status(401).json({ error: 'Credenziali non valide' });
  if (profilo.eliminato) return res.status(403).json({ error: 'Account disattivato — contatta l\'amministratore' });
  const ok = await bcrypt.compare(password, profilo.password_hash);
  if (!ok) return res.status(401).json({ error: 'Credenziali non valide' });
  res.json({ token: signToken(profilo), profilo: profiloPubblico(profilo) });
});

// Sostituisce sb.auth.getSession() + select da presenze_profili
router.get('/me', requireAuth, async (req, res) => {
  const profilo = await Profilo.findById(req.user.id);
  if (!profilo) return res.status(404).json({ error: 'Profilo non trovato' });
  if (profilo.eliminato) return res.status(403).json({ error: 'Account disattivato' });
  res.json(profiloPubblico(profilo));
});

// Cambio password (richiede la password attuale) — sostituisce sb.auth.updateUser
router.post('/cambia-password', requireAuth, async (req, res) => {
  const { attuale, nuova } = req.body || {};
  if (!nuova || nuova.length < 8) return res.status(400).json({ error: 'Nuova password minimo 8 caratteri' });
  const profilo = await Profilo.findById(req.user.id);
  if (!profilo) return res.status(404).json({ error: 'Profilo non trovato' });
  const ok = await bcrypt.compare(attuale || '', profilo.password_hash);
  if (!ok) return res.status(401).json({ error: 'Password attuale non corretta' });
  profilo.password_hash = await bcrypt.hash(nuova, 12);
  profilo.primo_accesso = false;
  await profilo.save();
  res.json({ ok: true });
});

// Admin: genera un link di invito per un nuovo dipendente — sostituisce
// l'insert diretto su presenze_inviti fatto dal client.
router.post('/inviti', requireAuth, requireAdmin, async (req, res) => {
  const { nome } = req.body || {};
  if (!nome) return res.status(400).json({ error: 'Nome obbligatorio' });
  const token = crypto.randomBytes(20).toString('hex');
  const scadenza = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const invito = await Invito.create({ nome, token, scadenza, creato_da: req.user.id });
  res.json({ token: invito.token, scadenza: invito.scadenza });
});

// Verifica pubblica di un token di invito (pagina di registrazione)
router.get('/inviti/:token', async (req, res) => {
  const invito = await Invito.findOne({ token: req.params.token });
  if (!invito) return res.status(404).json({ error: 'Link non valido' });
  if (invito.usato) return res.status(410).json({ error: 'Link già utilizzato' });
  if (invito.scadenza < new Date()) return res.status(410).json({ error: 'Link scaduto' });
  res.json({ nome: invito.nome });
});

// Registrazione da link di invito — crea il Profilo dipendente.
// Sostituisce sb.auth.signUp() + insert/update su presenze_profili.
router.post('/registrazione', async (req, res) => {
  const {
    token, email, password, nome, cognome, data_nascita, codice_fiscale,
    telefono, indirizzo, iban,
  } = req.body || {};

  if (!token || !email || !password) {
    return res.status(400).json({ error: 'Token, email e password sono obbligatori' });
  }
  if (password.length < 8) return res.status(400).json({ error: 'Password minimo 8 caratteri' });

  const invito = await Invito.findOne({ token });
  if (!invito) return res.status(404).json({ error: 'Link non valido' });
  if (invito.usato) return res.status(410).json({ error: 'Link già utilizzato' });
  if (invito.scadenza < new Date()) return res.status(410).json({ error: 'Link scaduto' });

  const esistente = await Profilo.findOne({ email: email.toLowerCase().trim() });
  if (esistente) return res.status(409).json({ error: 'Email già registrata' });

  const password_hash = await bcrypt.hash(password, 12);
  const profilo = await Profilo.create({
    email: email.toLowerCase().trim(),
    password_hash,
    ruolo: 'dipendente',
    nome: nome || invito.nome,
    cognome, data_nascita, codice_fiscale, telefono, indirizzo, iban,
    primo_accesso: true,
    attivo: false, // si attiva a fine onboarding (privacy + telegram + certificazione numero)
  });

  invito.usato = true;
  await invito.save();

  res.status(201).json({ token: signToken(profilo), profilo: profiloPubblico(profilo) });
});

module.exports = router;
