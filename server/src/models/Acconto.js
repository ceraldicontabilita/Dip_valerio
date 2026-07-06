const mongoose = require('mongoose');
const { Schema } = mongoose;

// Sostituisce presenze_acconti (anticipi su stipendio).
const AccontoSchema = new Schema(
  {
    dipendente_id: { type: Schema.Types.ObjectId, ref: 'Profilo', required: true },
    importo: { type: Number, required: true },
    data: { type: String, required: true }, // YYYY-MM-DD
    note: { type: String },
    registrato_da: { type: Schema.Types.ObjectId, ref: 'Profilo' },
    letto_dip: { type: Boolean, default: false },
    letto_il: { type: Date, default: null },
  },
  { timestamps: { createdAt: 'creato_il', updatedAt: false } }
);

module.exports = mongoose.model('Acconto', AccontoSchema);
