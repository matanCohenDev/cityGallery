const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
  title:     { type: String, required: true, trim: true, maxlength: 120 },
  content:   { type: String, required: true, trim: true, maxlength: 4000 },
  images:    [{ type: String }], 
  author:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  group:     { type: mongoose.Schema.Types.ObjectId, ref: 'Group' }, 
  location: {
    address: { type: String },
    coordinates: {
      lat: { type: Number },
      lng: { type: Number },
    }
  },
}, { timestamps: true });

module.exports = mongoose.model('Post', postSchema);
