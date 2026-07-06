const mongoose = require('mongoose');
const { Schema } = mongoose;

// Sostituisce presenze_inviti (link di registrazione per nuovi dipendenti).
const InvitoSchema = new Schema(
  {
    nome: { type: String, required: true },
    token: { type: String, required: true, unique: true },
    scadenza: { type: Date, required: true },
    usato: { type: Boolean, default: false },
    creato_da: { type: Schema.Types.ObjectId, ref: 'Profilo' },
  },
  { timestamps: { createdAt: 'creato_il', updatedAt: false } }
);

module.exports = mongoose.model('Invito', InvitoSchema);
