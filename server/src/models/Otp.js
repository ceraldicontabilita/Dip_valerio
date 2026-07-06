const mongoose = require('mongoose');
const { Schema } = mongoose;

// Sostituisce presenze_otp (codici usa-e-getta per certificazione contatti
// e conferma timbrature manuali).
const OtpSchema = new Schema(
  {
    presenza_id: { type: Schema.Types.ObjectId, ref: 'Presenza', default: null },
    dipendente_id: { type: Schema.Types.ObjectId, ref: 'Profilo', required: true },
    codice: { type: String, required: true },
    tipo: { type: String, enum: ['cert_tel', 'cert_email', 'admin_gen'], default: 'admin_gen' },
    expires_at: { type: Date, required: true },
    used: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false } }
);

OtpSchema.index({ dipendente_id: 1, tipo: 1, used: 1 });

module.exports = mongoose.model('Otp', OtpSchema);
