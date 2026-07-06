const mongoose = require('mongoose');
const { Schema } = mongoose;

// Sostituisce presenze_avvisi (bacheca comunicazioni).
const AvvisoSchema = new Schema(
  {
    titolo: { type: String, required: true },
    testo: { type: String, required: true },
    priorita: { type: String, enum: ['normale', 'importante', 'urgente'], default: 'normale' },
    attivo: { type: Boolean, default: true },
    creato_da: { type: Schema.Types.ObjectId, ref: 'Profilo' },
  },
  { timestamps: { createdAt: 'creato_il', updatedAt: false } }
);

module.exports = mongoose.model('Avviso', AvvisoSchema);
