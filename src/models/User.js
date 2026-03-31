const mongoose = require('mongoose');

const ROLES = ['USER', 'SUPREME', 'ADMIN', 'SUPERADMIN'];

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, default: '', trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ROLES, default: 'USER' },
    emailVerified: { type: Boolean, default: false },
  },
  { timestamps: true }
);

userSchema.statics.ROLES = ROLES;

module.exports = mongoose.model('User', userSchema);
