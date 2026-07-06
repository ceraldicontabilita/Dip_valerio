const mongoose = require('mongoose');
const { Schema } = mongoose;

// Sostituisce presenze_liquidazioni (stipendi mensili liquidati).
const LiquidazioneSchema = new Schema(
  {
    dipendente_id: { type: Schema.Types.ObjectId, ref: 'Profilo', required: true },
    anno: { type: Number, required: true },
    mese: { type: Number, required: true },
    giorni: { type: Number, required: true },
    importo_lordo: { type: Number, required: true },
    acconti: { type: Number, default: 0 },
    importo_netto: { type: Number, required: true },
    note: { type: String },
    liquidato_da: { type: Schema.Types.ObjectId, ref: 'Profilo' },
    confermata_dip: { type: Boolean, default: false },
    confermata_il: { type: Date, default: null },
  },
  { timestamps: { createdAt: 'creato_il', updatedAt: false } }
);

// Un solo mese/anno per dipendente, come il vincolo unico originale su Supabase.
LiquidazioneSchema.index({ dipendente_id: 1, anno: 1, mese: 1 }, { unique: true });

module.exports = mongoose.model('Liquidazione', LiquidazioneSchema);
