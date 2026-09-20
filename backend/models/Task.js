const mongoose = require('mongoose');

const validDate = value => !value || (/^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value);

const noteItemSchema = new mongoose.Schema({
  text: { type: String, required: true, trim: true, maxlength: 500 },
  completed: { type: Boolean, default: false },
  completedBy: { type: String, default: '' },
  completedAt: { type: Date, default: null },
}, { _id: true });

const schema = new mongoose.Schema({
  kind: { type: String, enum: ['task', 'note'], default: 'task' },
  title: { type: String, required: true, trim: true, maxlength: 160 },
  description: { type: String, default: '', maxlength: 4000 },
  items: { type: [noteItemSchema], default: [] },
  assignedTo: { type: String, default: '' },
  assignedName: { type: String, default: '' },
  dueDate: { type: String, default: '', validate: validDate },
  completed: { type: Boolean, default: false },
  completedBy: { type: String, default: '' },
  completedAt: { type: Date, default: null },
  createdBy: { type: String, required: true },
  updatedBy: { type: String, required: true },
}, { timestamps: true });

schema.index({ kind: 1, completed: 1, dueDate: 1 });
module.exports = mongoose.model('Task', schema);
module.exports.validDate = validDate;
