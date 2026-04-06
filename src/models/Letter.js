const mongoose = require('mongoose');

const STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'SENT'];

const KINDS = ['HTML', 'UPLOAD'];

const TEMPLATES = ['DEFAULT', 'SURAT_TUGAS', 'SURAT_TUGAS_PANDUAN', 'SURAT_TUGAS_TENAGA_AHLI', 'SURAT_TUGAS_UNDANGAN', 'SURAT_TUGAS_IN_HOUSE_TRAINING'];

const barcodePositionSchema = new mongoose.Schema(
  {
    xPct: { type: Number, default: 80 },
    yPct: { type: Number, default: 86 },
  },
  { _id: false }
);

const signatureEntrySchema = new mongoose.Schema(
  {
    signatureId: { type: String, required: true },
    signerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    signerEmail: { type: String, default: '' },
    signedAt: { type: Date, required: true },
    token: { type: String, required: true },
    barcodePosition: { type: barcodePositionSchema, default: () => ({}) },
  },
  { _id: false }
);

const requestedSignerSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    email: { type: String, default: '' },
    tier: { type: Number, default: 1 },
  },
  { _id: false }
);

const letterSchema = new mongoose.Schema(
  {
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    status: { type: String, enum: STATUSES, default: 'DRAFT', index: true },

    // Letter kind: HTML (generated via template) or UPLOAD (uploaded PDF to e-sign)
    kind: { type: String, enum: KINDS, default: 'HTML', index: true },

    // Uploaded document metadata (only for kind=UPLOAD)
    upload: {
      storagePath: { type: String, default: '' },
      originalName: { type: String, default: '' },
      mimeType: { type: String, default: '' },
      size: { type: Number, default: 0 },
    },

    // Letter content
    template: { type: String, enum: TEMPLATES, default: 'DEFAULT', index: true },
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

    // Optional rich text (sanitized HTML). When present, preferred over plain text fields.
    recipientAddressHtml: { type: String, default: '' },

    body: { type: String, default: '' },
    bodyHtml: { type: String, default: '' },
    closing: { type: String, default: '' },

    // Layout controls (applied globally)
    fontSizePt: { type: Number, default: 12 },
    lineHeight: { type: Number, default: 1.55 },
    paragraphSpacingPt: { type: Number, default: 0 },
    sectionSpacingPt: { type: Number, default: 0 },

    signatoryName: { type: String, default: '' },
    signatoryTitle: { type: String, default: '' },
    signatoryNip: { type: String, default: '' },

    // Template-specific extra fields (stored as text; parsed at render time)
    tableRowsRaw: { type: String, default: '' },
    detailsRaw: { type: String, default: '' },

    // Workflow timestamps
    submittedAt: { type: Date },
    approvedAt: { type: Date },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    // Legacy single signature (kept for backward compatibility)
    signatureToken: { type: String, default: '' },
    barcodePosition: { type: barcodePositionSchema, default: () => ({}) },

    // Multi signer signatures (preferred)
    signatures: { type: [signatureEntrySchema], default: () => [] },

    // Requested Supreme signers (who must sign before APPROVED)
    requestedSigners: { type: [requestedSignerSchema], default: () => [] },
    requiredSupremeSignatures: { type: Number, default: 0 },
    requestedSignersSetAt: { type: Date },

    sentAt: { type: Date },
    sentBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

letterSchema.statics.STATUSES = STATUSES;
letterSchema.statics.TEMPLATES = TEMPLATES;
letterSchema.statics.KINDS = KINDS;

module.exports = mongoose.model('Letter', letterSchema);
