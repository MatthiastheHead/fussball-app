const mongoose = require('mongoose');

const LoginEventSchema = new mongoose.Schema({
  username: { type: String, required: true, trim: true, index: true },
  loggedInAt: { type: Date, required: true, default: Date.now, index: true },
});

module.exports = mongoose.model('LoginEvent', LoginEventSchema);
