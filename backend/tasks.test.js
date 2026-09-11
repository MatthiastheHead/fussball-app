const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Task = require('./models/Task');
const registerRoutes = require('./taskRoutes');
const { mayAccess } = require('./accessUtils');
const id = '111111111111111111111111';
function harness() {
  const routes = {}, rows = [];
  const users = [{ _id: id, name: 'Robert' }, { _id: '222222222222222222222222', name: 'Gesperrt', permissions: { tasks: false } }];
  const query = value => ({ select: () => ({ lean: async () => value }), lean: async () => value });
  const User = { find: () => query(users), findById: value => query(users.find(user => user._id === value)) };
  const Model = {
    find: () => ({ sort: () => ({ lean: async () => rows }) }),
    create: async data => { const doc = new Task({ ...data, _id: id, __v: 0 }); await doc.validate(); const row = doc.toObject(); rows.push(row); return row; },
    findById: value => query(rows.find(row => String(row._id) === value)),
    findOneAndUpdate: async (filter, changes) => { const row = rows.find(item => String(item._id) === String(filter._id) && item.__v === filter.__v); if (!row) return null; Object.assign(row, changes.$set); row.__v++; return row; },
  };
  const app = {};
  for (const method of ['get', 'post', 'patch']) app[method] = (path, access, handler) => { routes[`${method} ${path}`] = { access, handler }; };
  registerRoutes({ app, Task: Model, User, mongoose, requireAccess: key => (req, res, next) => {
    if (!req.auth) return res.status(401).json({});
    if (!mayAccess({ name: req.auth.username, ...req.auth }, key)) return res.status(403).json({});
    next();
  } });
  const invoke = (route, body = {}, auth = { username: 'Matthias' }, taskId = id) => new Promise(resolve => {
    const res = { code: 200, status(value) { this.code = value; return this; }, json(data) { resolve({ code: this.code, data }); } };
    const req = { body, auth, params: { id: taskId } };
    routes[route].access(req, res, () => routes[route].handler(req, res));
  });
  return { rows, invoke };
}
const input = { title: 'Leibchen waschen', description: 'Orange und Grau', assignedTo: id, dueDate: '2026-09-15' };
test('Aufgaben erhalten Zuständigkeit und serverseitige Erledigt-Vermerke', async () => {
  const { invoke } = harness();
  const created = await invoke('post /tasks', { ...input, createdBy: 'Gefälscht', completed: true });
  assert.equal(created.code, 201);
  assert.equal(created.data.createdBy, 'Matthias');
  assert.equal(created.data.assignedName, 'Robert');
  assert.equal(created.data.completed, false);
  const done = await invoke('patch /tasks/:id', { completed: true }, { username: 'Robert' });
  assert.equal(done.data.completedBy, 'Robert');
  assert.ok(done.data.completedAt instanceof Date);
  const opened = await invoke('patch /tasks/:id', { completed: false });
  assert.equal(opened.data.completedBy, '');
  assert.equal(opened.data.completedAt, null);
  const edited = await invoke('patch /tasks/:id', { ...input, title: 'Leibchen mitbringen' });
  assert.equal(edited.data.title, 'Leibchen mitbringen');
});
test('Alle Aufgabenendpunkte erfordern Anmeldung und Bereichsfreigabe', async () => {
  const { invoke } = harness();
  for (const path of ['get /tasks', 'get /tasks/assignees', 'post /tasks', 'patch /tasks/:id']) {
    assert.equal((await invoke(path, input, null)).code, 401);
    assert.equal((await invoke(path, input, { username: 'Trainer', permissions: { tasks: false } })).code, 403);
  }
  const users = await invoke('get /tasks/assignees');
  assert.deepEqual(users.data, [{ _id: id, name: 'Robert' }]);
});
test('Ungültige Aufgaben und unbekannte Zuständige werden abgewiesen', async () => {
  const { invoke, rows } = harness();
  for (const changes of [{ title: ' ' }, { dueDate: '2026-02-30' }, { description: 'a'.repeat(4001) }, { assignedTo: '333333333333333333333333' }, { assignedTo: '222222222222222222222222' }]) {
    assert.equal((await invoke('post /tasks', { ...input, ...changes })).code, 400);
  }
  assert.equal(rows.length, 0);
  assert.equal((await invoke('patch /tasks/:id', input)).code, 404);
});
