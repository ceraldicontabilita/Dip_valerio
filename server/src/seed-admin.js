// Crea (o aggiorna la password de) l'account amministratore iniziale.
// Uso: ADMIN_EMAIL=... ADMIN_PASSWORD=... node src/seed-admin.js
// Da eseguire una sola volta dopo il primo deploy (o quando serve resettare
// la password admin). Legge anche MONGO_URL/DB_NAME dal file .env.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { connectDB } = require('./db');
const Profilo = require('./models/Profilo');

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const nome = process.env.ADMIN_NOME || 'Amministratore';
  if (!email || !password) {
    console.error('Imposta ADMIN_EMAIL e ADMIN_PASSWORD come variabili d\'ambiente prima di eseguire questo script.');
    process.exit(1);
  }
  await connectDB();
  const password_hash = await bcrypt.hash(password, 12);
  const esistente = await Profilo.findOne({ email: email.toLowerCase().trim() });
  if (esistente) {
    esistente.password_hash = password_hash;
    esistente.ruolo = 'admin';
    esistente.attivo = true;
    esistente.eliminato = false;
    await esistente.save();
    console.log(`Admin "${email}" aggiornato (password reimpostata).`);
  } else {
    await Profilo.create({
      email: email.toLowerCase().trim(),
      password_hash,
      ruolo: 'admin',
      nome,
      attivo: true,
      primo_accesso: false,
      privacy_accettata: true,
    });
    console.log(`Admin "${email}" creato.`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
