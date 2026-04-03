const mongoose = require('mongoose');

const PURPOSES = ['register', 'login', 'forgot', 'change-email'];

const otpCodeSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    purpose: { type: String, enum: PURPOSES, required: true, index: true },
    code: { type: String, required: true },
    channel: { type: String, enum: ['email', 'whatsapp'], default: 'email' },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    usedAt: { type: Date },
  },
  { timestamps: true }
);

otpCodeSchema.index({ userId: 1, purpose: 1, code: 1 });

module.exports = mongoose.model('OtpCode', otpCodeSchema);
