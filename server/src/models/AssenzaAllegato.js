const mongoose = require('mongoose');
const { Schema } = mongoose;

// Sostituisce presenze_assenze_allegati (allegati/certificati caricati dal dipendente).
const AssenzaAllegatoSchema = new Schema(
  {
    assenza_id: { type: Schema.Types.ObjectId, ref: 'Assenza', required: true },
    nome_file: { type: String, required: true },
    url: { type: String, required: true }, // percorso file su disco/storage backend
  },
  { timestamps: { createdAt: 'creato_il', updatedAt: false } }
);

module.exports = mongoose.model('AssenzaAllegato', AssenzaAllegatoSchema);
