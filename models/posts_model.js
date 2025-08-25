const mongoose = require('mongoose');
const { Schema, Types } = mongoose;

const CommentSchema = new Schema({
  user:      { type: Types.ObjectId, ref: 'User', required: true },
  text:      { type: String, required: true, trim: true, maxlength: 2000 },
  createdAt: { type: Date, default: Date.now }
}, { _id: true });

const postSchema = new Schema({
  title:   { type: String, required: true, trim: true, maxlength: 120 },
  content: { type: String, required: true, trim: true, maxlength: 4000 },
  images:  [{ type: String }],
  author:  { type: Types.ObjectId, ref: 'User', required: true },
  group:   { type: Types.ObjectId, ref: 'Group' },

  location: {
    address: { type: String },
    coordinates: {
      lat: { type: Number },
      lng: { type: Number },
    }
  },

  likes:    [{ type: Types.ObjectId, ref: 'User' }],
  comments: [CommentSchema],

}, { timestamps: true });

postSchema.index({ createdAt: -1 });
postSchema.index({ title: 'text', content: 'text' });

module.exports = mongoose.model('Post', postSchema);
