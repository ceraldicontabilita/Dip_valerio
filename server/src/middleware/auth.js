const jwt = require('jsonwebtoken');

// Verifica il JWT nell'header Authorization: Bearer <token> e attacca
// req.user = { id, ruolo, email }. Sostituisce sb.auth.getSession() lato client.
// Accetta il token anche come query string (?token=...) per i link di
// download diretti (<a href>, window.open) che non possono impostare header.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : (req.query.token || null);
  if (!token) return res.status(401).json({ error: 'Token mancante' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Token non valido o scaduto' });
  }
}

// Da usare dopo requireAuth: blocca l'accesso se il ruolo non è admin.
function requireAdmin(req, res, next) {
  if (!req.user || req.user.ruolo !== 'admin') {
    return res.status(403).json({ error: 'Accesso riservato agli amministratori' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
