const mongoose = require('mongoose');

const elementSchema = new mongoose.Schema({
  id: { type: String, required: true },
  type: { type: String, enum: ['field', 'text'], default: 'field' },
  field: { type: String, default: 'name' }, // 'name','date','certNo','event','position','organization'
  text: { type: String, default: '' },       // for type=text: fixed string
  x: { type: Number, default: 50 },          // center % horizontal
  y: { type: Number, default: 50 },          // center % vertical
  fontSize: { type: Number, default: 32 },
  fontFamily: { type: String, default: 'Calibri, Arial, sans-serif' },
  color: { type: String, default: '#1a1a1a' },
  align: { type: String, default: 'center' },
  bold: { type: Boolean, default: false },
  italic: { type: Boolean, default: false },
  maxWidth: { type: Number, default: 80 },   // max width % for text wrapping
}, { _id: false });

const certTemplateSchema = new mongoose.Schema({
  name: { type: String, required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  backgroundPath: { type: String, default: '' }, // disk path in uploads/cert-bg/
  orientation: { type: String, enum: ['landscape', 'portrait'], default: 'landscape' },
  bgColor: { type: String, default: '#ffffff' }, // fallback when no background image
  elements: [elementSchema],
}, { timestamps: true });

module.exports = mongoose.model('CertTemplate', certTemplateSchema);
