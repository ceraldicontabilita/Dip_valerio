// Tutte le chiamate Telegram passano da qui, lato server: i token dei bot
// non sono più esposti nel codice client (come accadeva nell'app Supabase
// originale, dove TG_TOKEN/TG_TOKEN_DIP erano hardcoded nell'HTML).
const Profilo = require('../models/Profilo');

const TG_TOKEN_ADMIN = process.env.TG_TOKEN_ADMIN;
const TG_CHAT_ADMIN = process.env.TG_CHAT_ADMIN;
const TG_TOKEN_DIPENDENTI = process.env.TG_TOKEN_DIPENDENTI;
const APP_URL = process.env.APP_URL || '';

async function sendMessage(token, chatId, testo) {
  if (!token || !chatId) return;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: testo,
        parse_mode: 'HTML',
        disable_web_page_preview: false,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[Telegram] invio rifiutato', res.status, body);
    }
  } catch (e) {
    console.error('[Telegram] errore rete', e.message);
  }
}

// Notifica l'amministratore sul bot admin.
async function inviaAdmin(testo) {
  await sendMessage(TG_TOKEN_ADMIN, TG_CHAT_ADMIN, testo);
}

// Notifica un singolo dipendente sul bot dedicato, con deep-link opzionale.
async function inviaDipendente(dipendenteId, testo, deepLink) {
  if (!TG_TOKEN_DIPENDENTI) return;
  const profilo = await Profilo.findById(dipendenteId).select('telegram_chat_id');
  if (!profilo || !profilo.telegram_chat_id) return;
  const link = APP_URL ? `\n\n<a href="${APP_URL}${deepLink || ''}">➡️ Apri nell'app</a>` : '';
  await sendMessage(TG_TOKEN_DIPENDENTI, profilo.telegram_chat_id, testo + link);
}

// Notifica tutti i dipendenti attivi collegati a Telegram (es. nuovo avviso).
async function inviaTuttiDipendenti(testo, deepLink) {
  if (!TG_TOKEN_DIPENDENTI) return;
  const profili = await Profilo.find({
    ruolo: 'dipendente',
    attivo: true,
    telegram_chat_id: { $ne: null },
  }).select('telegram_chat_id');
  const link = APP_URL ? `\n\n<a href="${APP_URL}${deepLink || ''}">➡️ Apri nell'app</a>` : '';
  for (const p of profili) {
    await sendMessage(TG_TOKEN_DIPENDENTI, p.telegram_chat_id, testo + link);
    await new Promise((r) => setTimeout(r, 100)); // evita rate limit Telegram
  }
}

// Escaping per messaggi Telegram in parse_mode HTML (& < > devono essere
// escapati o Telegram rifiuta l'intero messaggio con errore 400).
function escTG(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

module.exports = { inviaAdmin, inviaDipendente, inviaTuttiDipendenti, escTG };
