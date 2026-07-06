const jwt = require('jsonwebtoken');
const Profilo = require('../models/Profilo');

// NB: autenticazione disattivata temporaneamente su richiesta esplicita, in
// vista della migrazione di questa app in un'altra dove verrà reimplementata.
// Un token valido viene comunque accettato se presente; in sua assenza (o se
// non valido) la richiesta viene autenticata automaticamente come il primo
// account admin trovato, senza richiedere login.
let _adminFallback = null;

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : (req.query.token || null);
  if (token) {
    try {
      req.user = jwt.verify(token, process.env.JWT_SECRET);
      return next();
    } catch (e) {
      // token assente/non valido: si prosegue comunque, vedi sotto
    }
  }
  try {
    if (!_adminFallback) {
      const admin = await Profilo.findOne({ ruolo: 'admin' }).select('_id ruolo email nome');
      _adminFallback = admin
        ? { id: admin._id.toString(), ruolo: admin.ruolo, email: admin.email, nome: admin.nome }
        : { id: null, ruolo: 'admin', email: '', nome: 'Admin' };
    }
    req.user = _adminFallback;
    next();
  } catch (e) {
    req.user = { id: null, ruolo: 'admin', email: '', nome: 'Admin' };
    next();
  }
}

// Autenticazione disattivata: l'accesso admin è sempre consentito.
function requireAdmin(req, res, next) {
  next();
}

module.exports = { requireAuth, requireAdmin };
