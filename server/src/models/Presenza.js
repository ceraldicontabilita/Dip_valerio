const mongoose = require('mongoose');
const { Schema } = mongoose;

// Sostituisce la tabella presenze (timbrature).
const PresenzaSchema = new Schema(
  {
    dipendente_id: { type: Schema.Types.ObjectId, ref: 'Profilo', required: true },
    nome_dipendente: { type: String, required: true },
    data: { type: String, required: true }, // YYYY-MM-DD, come nell'app originale
    ts_entrata: { type: Date, required: true },
    ts_uscita: { type: Date, default: null },
    note: { type: String },

    registrato_da: { type: Schema.Types.ObjectId, ref: 'Profilo' },
    tipo_timbratura: { type: String, enum: ['qr', 'manuale', 'manuale_dip'], default: 'qr' },
    motivo_manuale: { type: String },
    confermata_dip: { type: Boolean, default: true },
  },
  { timestamps: { createdAt: 'creato_il', updatedAt: false } }
);

PresenzaSchema.index({ dipendente_id: 1, data: 1 });

module.exports = mongoose.model('Presenza', PresenzaSchema);
