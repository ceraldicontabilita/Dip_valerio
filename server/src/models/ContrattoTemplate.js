const mongoose = require('mongoose');
const { Schema } = mongoose;

// Sostituisce presenze_contratto_template (documento unico, sempre id=1 su
// Supabase). Qui teniamo lo stesso schema a singleton: un solo documento.
const ContrattoTemplateSchema = new Schema(
  {
    testo: { type: String, required: true },
    versione: { type: String, required: true },
    aggiornato_da: { type: Schema.Types.ObjectId, ref: 'Profilo' },
  },
  { timestamps: { createdAt: false, updatedAt: 'aggiornato_il' } }
);

module.exports = mongoose.model('ContrattoTemplate', ContrattoTemplateSchema);
