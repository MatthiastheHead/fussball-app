const { mayAccess } = require('./accessUtils');
const { validDate } = require('./models/Task');

module.exports = function registerTaskRoutes({ app, Task, User, requireAccess, mongoose }) {
  const taskAccess = requireAccess('tasks');
  const noteAccess = requireAccess('notes');
  const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
  const wrap = handler => async (req, res) => {
    try { await handler(req, res); }
    catch (error) { res.status(error.status || 500).json({ error: error.status ? error.message : 'Der Eintrag konnte nicht verarbeitet werden. Bitte erneut versuchen.' }); }
  };

  app.get('/tasks/assignees', taskAccess, wrap(async (_req, res) => {
    const users = await User.find({}).select('_id name isAdmin permissions').lean();
    res.json(users.filter(user => mayAccess(user, 'tasks')).map(user => ({ _id: String(user._id), name: user.name })));
  }));

  app.get('/tasks', taskAccess, wrap(async (_req, res) => {
    res.json(await Task.find({ kind: { $ne: 'note' } }).sort({ completed: 1, createdAt: -1 }).lean());
  }));

  app.get('/notes', noteAccess, wrap(async (_req, res) => {
    res.json(await Task.find({ kind: 'note' }).sort({ completed: 1, createdAt: -1 }).lean());
  }));

  app.get('/tasks/my-open-count', taskAccess, wrap(async (req, res) => {
    const user = await User.findOne({ name: req.auth.username }).select('_id').lean();
    const count = user ? await Task.countDocuments({ kind: { $ne: 'note' }, assignedTo: String(user._id), completed: false }) : 0;
    res.json({ count });
  }));

  async function fields(body, current, forcedKind = '') {
    if (!body || typeof body !== 'object' || Array.isArray(body)) fail('Ungültiger Eintrag.');
    const kind = forcedKind || (body.kind === 'note' ? 'note' : current?.kind === 'note' ? 'note' : 'task');
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title || title.length > 160) fail('Bitte eine Überschrift mit höchstens 160 Zeichen eingeben.');
    if (typeof body.description !== 'string' || body.description.length > 4000) fail('Der Text darf höchstens 4000 Zeichen enthalten.');

    if (kind === 'note') {
      if (!Array.isArray(body.items) || body.items.length > 100) fail('Eine Notiz darf höchstens 100 Stichpunkte enthalten.');
      const currentItems = Array.isArray(current?.items) ? current.items : [];
      const items = body.items.map(item => {
        const text = typeof item?.text === 'string' ? item.text.trim() : '';
        if (!text || text.length > 500) fail('Jeder Stichpunkt benötigt Text mit höchstens 500 Zeichen.');
        const existing = item?._id ? currentItems.find(row => String(row._id) === String(item._id)) : null;
        return {
          ...(existing ? { _id: existing._id } : {}),
          text,
          status: existing?.status || (existing?.completed === true ? 'done' : 'open'),
          statusBy: existing?.statusBy || existing?.completedBy || '',
          statusAt: existing?.statusAt || existing?.completedAt || null,
          completed: false,
          completedBy: '',
          completedAt: null,
        };
      });
      return { kind, title, description: body.description.trim(), items, dueDate: '', assignedTo: '', assignedName: '' };
    }

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
    return { kind: 'task', title, description: body.description.trim(), items: [], dueDate: body.dueDate, assignedTo: body.assignedTo, assignedName };
  }

  app.post('/tasks', taskAccess, wrap(async (req, res) => {
    const data = await fields(req.body, null, 'task');
    res.status(201).json(await Task.create({ ...data, createdBy: req.auth.username, updatedBy: req.auth.username }));
  }));

  app.patch('/tasks/:id', taskAccess, wrap(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) fail('Ungültige Aufgabe.');
    const current = await Task.findById(req.params.id).lean();
    if (!current || current.kind === 'note') fail('Die Aufgabe wurde nicht gefunden.', 404);
    let data;
    if (Object.keys(req.body || {}).length === 1 && typeof req.body.completed === 'boolean') {
      data = { completed: req.body.completed, completedBy: req.body.completed ? req.auth.username : '', completedAt: req.body.completed ? new Date() : null };
    } else data = await fields(req.body, current, 'task');
    const task = await Task.findOneAndUpdate(
      { _id: current._id, __v: current.__v },
      { $set: { ...data, updatedBy: req.auth.username }, $inc: { __v: 1 } },
      { new: true, runValidators: true }
    );
    if (!task) fail('Die Aufgabe wurde gerade geändert. Bitte aktualisieren und erneut versuchen.', 409);
    res.json(task);
  }));

  app.delete('/tasks/:id', taskAccess, wrap(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) fail('Ungültige Aufgabe.');
    if (req.body?.confirm !== true) fail('Bitte das Löschen bestätigen.');
    const current = await Task.findById(req.params.id).lean();
    if (!current || current.kind === 'note') fail('Die Aufgabe wurde nicht gefunden.', 404);
    await Task.findByIdAndDelete(req.params.id);
    res.json({ ok: true, id: req.params.id });
  }));

  app.post('/notes', noteAccess, wrap(async (req, res) => {
    const data = await fields(req.body, null, 'note');
    res.status(201).json(await Task.create({ ...data, completed: false, createdBy: req.auth.username, updatedBy: req.auth.username }));
  }));

  app.patch('/notes/:id/items/:itemId', noteAccess, wrap(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id) || !mongoose.isValidObjectId(req.params.itemId)) fail('Ungültiger Stichpunkt.');
    const status = req.body?.status;
    if (!['open', 'accepted', 'declined', 'done'].includes(status)) fail('Ungültiger Status.');
    const current = await Task.findById(req.params.id).lean();
    if (!current || current.kind !== 'note') fail('Die Notiz wurde nicht gefunden.', 404);
    let found = false;
    const items = (current.items || []).map(item => {
      if (String(item._id) !== req.params.itemId) return item;
      found = true;
      return {
        ...item,
        status,
        statusBy: status === 'open' ? '' : req.auth.username,
        statusAt: status === 'open' ? null : new Date(),
        completed: false,
        completedBy: '',
        completedAt: null,
      };
    });
    if (!found) fail('Der Stichpunkt wurde nicht gefunden.', 404);
    const note = await Task.findOneAndUpdate(
      { _id: current._id, __v: current.__v },
      { $set: { items, updatedBy: req.auth.username }, $inc: { __v: 1 } },
      { new: true, runValidators: true }
    );
    if (!note) fail('Die Notiz wurde gerade geändert. Bitte aktualisieren und erneut versuchen.', 409);
    res.json(note);
  }));

  app.patch('/notes/:id/status', noteAccess, wrap(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) fail('Ungültige Notiz.');
    if (typeof req.body?.completed !== 'boolean') fail('Ungültiger Status.');
    const current = await Task.findById(req.params.id).lean();
    if (!current || current.kind !== 'note') fail('Die Notiz wurde nicht gefunden.', 404);
    const note = await Task.findOneAndUpdate(
      { _id: current._id, __v: current.__v },
      { $set: {
        completed: req.body.completed,
        completedBy: req.body.completed ? req.auth.username : '',
        completedAt: req.body.completed ? new Date() : null,
        updatedBy: req.auth.username,
      }, $inc: { __v: 1 } },
      { new: true, runValidators: true }
    );
    if (!note) fail('Die Notiz wurde gerade geändert. Bitte aktualisieren und erneut versuchen.', 409);
    res.json(note);
  }));

  app.patch('/notes/:id', noteAccess, wrap(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) fail('Ungültige Notiz.');
    const current = await Task.findById(req.params.id).lean();
    if (!current || current.kind !== 'note') fail('Die Notiz wurde nicht gefunden.', 404);
    const data = await fields(req.body, current, 'note');
    const note = await Task.findOneAndUpdate(
      { _id: current._id, __v: current.__v },
      { $set: { ...data, updatedBy: req.auth.username }, $inc: { __v: 1 } },
      { new: true, runValidators: true }
    );
    if (!note) fail('Die Notiz wurde gerade geändert. Bitte aktualisieren und erneut versuchen.', 409);
    res.json(note);
  }));

  app.delete('/notes/:id', noteAccess, wrap(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) fail('Ungültige Notiz.');
    if (req.body?.confirm !== true) fail('Bitte das Löschen bestätigen.');
    const current = await Task.findById(req.params.id).lean();
    if (!current || current.kind !== 'note') fail('Die Notiz wurde nicht gefunden.', 404);
    await Task.findByIdAndDelete(req.params.id);
    res.json({ ok: true, id: req.params.id });
  }));
};
