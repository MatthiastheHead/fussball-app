const { mayAccess } = require('./accessUtils');
const { validDate } = require('./models/Task');

module.exports = function registerTaskRoutes({ app, Task, User, requireAccess, mongoose }) {
  const access = requireAccess('tasks');
  const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
  const wrap = handler => async (req, res) => {
    try { await handler(req, res); }
    catch (error) { res.status(error.status || 500).json({ error: error.status ? error.message : 'Die Aufgabe konnte nicht verarbeitet werden. Bitte erneut versuchen.' }); }
  };
  app.get('/tasks/assignees', access, wrap(async (_req, res) => {
    const users = await User.find({}).select('_id name isAdmin permissions').lean();
    res.json(users.filter(user => mayAccess(user, 'tasks')).map(user => ({ _id: String(user._id), name: user.name })));
  }));
  app.get('/tasks', access, wrap(async (_req, res) => {
    res.json(await Task.find({}).sort({ completed: 1, createdAt: -1 }).lean());
  }));
  app.get('/tasks/my-open-count', access, wrap(async (req, res) => {
    const user = await User.findOne({ name: req.auth.username }).select('_id').lean();
    const count = user ? await Task.countDocuments({ assignedTo: String(user._id), completed: false }) : 0;
    res.json({ count });
  }));
  app.delete('/tasks/:id', access, wrap(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) fail('Ungültiges To-do.');
    if (req.body?.confirm !== true) fail('Bitte das Löschen bestätigen.');
    const removed = await Task.findByIdAndDelete(req.params.id);
    if (!removed) fail('Das To-do wurde nicht gefunden.', 404);
    res.json({ ok: true, id: String(removed._id) });
  }));
  async function fields(body, current) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) fail('Ungültige Aufgabe.');
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title || title.length > 160) fail('Bitte einen Titel mit höchstens 160 Zeichen eingeben.');
    if (typeof body.description !== 'string' || body.description.length > 4000) fail('Die Beschreibung darf höchstens 4000 Zeichen enthalten.');
    if (typeof body.dueDate !== 'string' || !validDate(body.dueDate)) fail('Bitte ein gültiges Fälligkeitsdatum wählen.');
    if (typeof body.assignedTo !== 'string') fail('Bitte eine zuständige Person auswählen.');
    let assignedName = '';
    if (body.assignedTo) {
      if (!mongoose.isValidObjectId(body.assignedTo)) fail('Ungültige zuständige Person.');
      const user = await User.findById(body.assignedTo).select('_id name isAdmin permissions').lean();
      if (user && mayAccess(user, 'tasks')) assignedName = user.name;
      else if (current && current.assignedTo === body.assignedTo) assignedName = current.assignedName;
      else fail('Die ausgewählte Person hat keinen Zugriff auf Aufgaben.');
    }
    return { title, description: body.description.trim(), dueDate: body.dueDate, assignedTo: body.assignedTo, assignedName };
  }
  app.post('/tasks', access, wrap(async (req, res) => {
    const data = await fields(req.body);
    res.status(201).json(await Task.create({ ...data, createdBy: req.auth.username, updatedBy: req.auth.username }));
  }));
  app.patch('/tasks/:id', access, wrap(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) fail('Ungültige Aufgabe.');
    const current = await Task.findById(req.params.id).lean();
    if (!current) fail('Die Aufgabe wurde nicht gefunden.', 404);
    let data;
    if (Object.keys(req.body || {}).length === 1 && typeof req.body.completed === 'boolean') {
      data = { completed: req.body.completed, completedBy: req.body.completed ? req.auth.username : '', completedAt: req.body.completed ? new Date() : null };
    } else data = await fields(req.body, current);
    // Optimistic concurrency prevents silently overwriting another trainer's change.
    const task = await Task.findOneAndUpdate({ _id: current._id, __v: current.__v }, { $set: { ...data, updatedBy: req.auth.username }, $inc: { __v: 1 } }, { new: true, runValidators: true });
    if (!task) fail('Die Aufgabe wurde gerade geändert. Bitte aktualisieren und erneut versuchen.', 409);
    res.json(task);
  }));
};
