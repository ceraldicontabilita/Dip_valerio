const mongoose = require('mongoose');
const { Schema } = mongoose;

// Sostituisce la tabella presenze_profili (Supabase) + Supabase Auth.
// password_hash sostituisce la gestione utenti di Supabase Auth.
const ProfiloSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password_hash: { type: String, required: true },
    ruolo: { type: String, enum: ['admin', 'dipendente'], default: 'dipendente' },

    nome: { type: String, required: true },
    cognome: { type: String },
    data_nascita: { type: Date },
    codice_fiscale: { type: String },
    telefono: { type: String },
    indirizzo: { type: String },
    iban: { type: String },

    data_assunzione: { type: Date },
    tipo_contratto: {
      type: String,
      enum: ['indeterminato', 'determinato', 'part_time', 'stagionale', 'apprendistato'],
      default: 'indeterminato',
    },
    scadenza_contratto: { type: Date },
    livello_ccnl: { type: String },
    mansione: { type: String },
    paga_giornaliera: { type: Number },
    ferie_annuali: { type: Number, default: 26 },
    permessi_annui: { type: Number, default: 104 },

    attivo: { type: Boolean, default: true },
    eliminato: { type: Boolean, default: false },
    eliminato_il: { type: Date },

    primo_accesso: { type: Boolean, default: true },

    privacy_accettata: { type: Boolean, default: false },
    privacy_accettata_il: { type: Date },
    privacy_versione: { type: String },
    contratto_accettato_il: { type: Date },
    contratto_versione: { type: String },

    telegram_chat_id: { type: String, default: null },
    tg_link_code: { type: String, default: null },
    tel_certificato_il: { type: Date },
    email_certificato_il: { type: Date },

    invite_token: { type: String, default: null },
    invite_scadenza: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Profilo', ProfiloSchema);
