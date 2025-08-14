const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true, minlength: 2, maxlength: 40 },
  email:    { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, minlength: 6 },
  role:     { type: String, enum: ['user', 'admin'], default: 'user' },
  groups:   [{ type: mongoose.Schema.Types.ObjectId, ref: 'Group' }],
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
