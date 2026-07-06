const mongoose = require('mongoose');
const { Schema } = mongoose;

// Sostituisce presenze_cambi_turno (scambio turni tra colleghi, con approvazione admin).
const CambioTurnoSchema = new Schema(
  {
    richiedente_id: { type: Schema.Types.ObjectId, ref: 'Profilo', required: true },
    nome_richiedente: { type: String, required: true },
    collega_id: { type: Schema.Types.ObjectId, ref: 'Profilo', required: true },
    nome_collega: { type: String, required: true },

    data_turno: { type: String, required: true }, // YYYY-MM-DD
    fascia_oraria: { type: String },
    note: { type: String },

    stato: {
      type: String,
      enum: ['attesa_collega', 'attesa_admin', 'approvata', 'rifiutata', 'rifiutata_collega'],
      default: 'attesa_collega',
    },
    collega_stato: { type: String, default: 'in attesa' },
    collega_risposto_il: { type: Date },
    risposto_il: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model('CambioTurno', CambioTurnoSchema);
