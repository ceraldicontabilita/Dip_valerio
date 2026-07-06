const express = require('express');
const Profilo = require('../models/Profilo');

const router = express.Router();

// Telegram invia qui ogni messaggio ricevuto dal bot dipendenti (va configurato
// con setWebhook puntando a <APP_URL_BACKEND>/api/telegram/webhook/dipendenti
// e passando lo stesso secret_token impostato in TG_WEBHOOK_SECRET).
// Quando un dipendente scrive "/start <codice>" (aprendo il deep-link
// generato da POST /api/profili/me/telegram/avvia), colleghiamo il suo
// chat_id al profilo corrispondente.
router.post('/webhook/dipendenti', express.json(), async (req, res) => {
  const secretAtteso = process.env.TG_WEBHOOK_SECRET;
  if (secretAtteso) {
    const secretRicevuto = req.headers['x-telegram-bot-api-secret-token'];
    if (secretRicevuto !== secretAtteso) return res.sendStatus(401);
  }

  const msg = req.body?.message;
  const testo = msg?.text || '';
  const chatId = msg?.chat?.id;
  const match = /^\/start\s+(\d{6})/.exec(testo.trim());

  if (match && chatId) {
    const codice = match[1];
    const profilo = await Profilo.findOne({ tg_link_code: codice });
    if (profilo) {
      profilo.telegram_chat_id = String(chatId);
      profilo.tg_link_code = null;
      await profilo.save();
      await sendReply(chatId, `✅ Telegram collegato! Bentornato/a ${profilo.nome}, torna nell'app per continuare.`);
    } else {
      await sendReply(chatId, 'Codice non riconosciuto o scaduto — genera un nuovo collegamento dall\'app.');
    }
  }

  res.sendStatus(200); // Telegram richiede sempre 200, altrimenti ritenta
});

async function sendReply(chatId, testo) {
  const token = process.env.TG_TOKEN_DIPENDENTI;
  if (!token) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: testo }),
    });
  } catch (e) {
    console.error('[Telegram webhook] errore invio risposta', e.message);
  }
}

module.exports = router;
