const mongoose = require('mongoose');
const { Schema } = mongoose;

// Sostituisce presenze_documenti (buste paga, CU, contratti, documenti vari).
const DocumentoSchema = new Schema(
  {
    dipendente_id: { type: Schema.Types.ObjectId, ref: 'Profilo', required: true },
    categoria: { type: String, enum: ['busta_paga', 'cu', 'contratto', 'altro'], required: true },
    nome_file: { type: String, required: true },
    descrizione: { type: String },
    url: { type: String, required: true }, // percorso file su disco/storage backend
    anno: { type: Number },
    mese: { type: Number },
    caricato_da: { type: Schema.Types.ObjectId, ref: 'Profilo' },
    letto_dip: { type: Boolean, default: false },
    letto_il: { type: Date, default: null },
  },
  { timestamps: { createdAt: 'creato_il', updatedAt: false } }
);

module.exports = mongoose.model('Documento', DocumentoSchema);
