const mongoose = require('mongoose');

const branchSchema = new mongoose.Schema({
  name:    { type: String, required: true, trim: true },
  address: { type: String, required: true, trim: true },
  coordinates: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
  }
}, { timestamps: true });

module.exports = mongoose.model('Branch', branchSchema);
