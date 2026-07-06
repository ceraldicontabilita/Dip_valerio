const mongoose = require('mongoose');
const { Schema } = mongoose;

// Sostituisce presenze_correzioni (log delle modifiche/eliminazioni manuali
// fatte dall'admin sulle timbrature, per tracciabilità).
const CorrezioneSchema = new Schema(
  {
    presenza_id: { type: Schema.Types.ObjectId, ref: 'Presenza', default: null },
    dipendente_id: { type: Schema.Types.ObjectId, ref: 'Profilo', default: null },
    azione: { type: String, enum: ['modifica', 'eliminazione'], required: true },
    motivo: { type: String, required: true },
    dati_prima: { type: Schema.Types.Mixed },
    eseguita_da: { type: Schema.Types.ObjectId, ref: 'Profilo', required: true },
  },
  { timestamps: { createdAt: 'creato_il', updatedAt: false } }
);

module.exports = mongoose.model('Correzione', CorrezioneSchema);
