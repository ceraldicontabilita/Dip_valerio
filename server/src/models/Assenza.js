const mongoose = require('mongoose');
const { Schema } = mongoose;

// Sostituisce la tabella presenze_assenze (ferie, malattia, acconto, altro).
const AssenzaSchema = new Schema(
  {
    dipendente_id: { type: Schema.Types.ObjectId, ref: 'Profilo', required: true },
    nome_dipendente: { type: String, required: true },
    tipo: { type: String, enum: ['ferie', 'malattia', 'acconto', 'altro'], required: true },

    data_inizio: { type: String }, // YYYY-MM-DD
    data_fine: { type: String },
    importo_richiesto: { type: Number },
    protocollo_inps: { type: String },
    note: { type: String },

    stato: {
      type: String,
      enum: ['in attesa', 'approvata', 'rifiutata', 'admin_inviata', 'confermata'],
      default: 'in attesa',
    },
    nota_admin: { type: String },
    invia_da_admin: { type: Boolean, default: false },
    creato_da_admin: { type: Schema.Types.ObjectId, ref: 'Profilo' },
  },
  { timestamps: { createdAt: 'creato_il', updatedAt: false } }
);

module.exports = mongoose.model('Assenza', AssenzaSchema);
