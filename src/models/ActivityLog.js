const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema(
  {
    actor: {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
      email: { type: String, default: '' },
      name: { type: String, default: '' },
      role: { type: String, default: '' },
    },
    action: { type: String, required: true, index: true },
    method: { type: String, default: '' },
    path: { type: String, default: '' },
    statusCode: { type: Number, default: null },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    target: {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
      letterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Letter', default: null, index: true },
    },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

activityLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('ActivityLog', activityLogSchema);
