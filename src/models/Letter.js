const mongoose = require('mongoose');

const STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'SENT'];

const barcodePositionSchema = new mongoose.Schema(
  {
    xPct: { type: Number, default: 80 },
    yPct: { type: Number, default: 86 },
  },
  { _id: false }
);

const letterSchema = new mongoose.Schema(
  {
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    status: { type: String, enum: STATUSES, default: 'DRAFT', index: true },

    // Letter content
    font: { type: String, default: 'calibri' },
    fontCustom: { type: String, default: '' },
    fontFamily: { type: String, default: '' },

    place: { type: String, default: '' },
    date: { type: String, default: '' },
    formattedDate: { type: String, default: '' },

    number: { type: String, default: '' },
    attachment: { type: String, default: '' },
    subject: { type: String, default: '' },

    recipient: { type: String, default: '' },
    recipientAddress: { type: String, default: '' },

    body: { type: String, default: '' },
    closing: { type: String, default: '' },

    signatoryName: { type: String, default: '' },
    signatoryTitle: { type: String, default: '' },

    // Workflow timestamps
    submittedAt: { type: Date },
    approvedAt: { type: Date },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    signatureToken: { type: String, default: '' },
    barcodePosition: { type: barcodePositionSchema, default: () => ({}) },

    sentAt: { type: Date },
    sentBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

letterSchema.statics.STATUSES = STATUSES;

module.exports = mongoose.model('Letter', letterSchema);
