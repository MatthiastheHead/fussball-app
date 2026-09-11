const { validateReceipt, MAX_TOTAL } = require('./receiptUtils');
module.exports = function registerReceiptRoutes({ app, mongoose, TeamCash, CashReceipt, requireAccess }) {
  const access = requireAccess('teamCash');
  const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
  const wrap = handler => async (req, res) => {
    try { await handler(req, res); }
    catch (error) { res.status(error.status || 503).json({ error: error.status ? error.message : 'Der Beleg konnte nicht verarbeitet werden. Bitte erneut versuchen.' }); }
  };
  async function transaction(id, auth, session, writing = false) {
    if (!/^[a-f\d]{24}$/i.test(id)) fail('Ungültige Buchung.');
    const cash = await TeamCash.findOne({ key: 'team-cash' }).session(session || null).lean();
    const row = cash?.transactions?.find(t => String(t._id) === id);
    if (!row || (row.deletedAt && (writing || !auth.cashPermissions?.canViewDeleted))) fail('Buchung nicht verfügbar.', 404);
    return row;
  }
  const meta = row => ({ _id: row._id, name: row.name, type: row.type, size: row.size, createdAt: row.createdAt, createdBy: row.createdBy });
  app.get('/team-cash/transactions/:id/receipts', access, wrap(async (req, res) => {
    await transaction(req.params.id, req.auth);
    res.set('Cache-Control', 'no-store');
    res.json((await CashReceipt.find({ transactionId: req.params.id }).select('-data').lean()).map(meta));
  }));
  app.post('/team-cash/transactions/:id/receipts', access, wrap(async (req, res) => {
    const file = validateReceipt(req.body);
    const session = await mongoose.startSession();
    let receipt;
    try {
      await session.withTransaction(async () => {
        await transaction(req.params.id, req.auth, session, true);
        // Serialize uploads and cash changes, including deletion and restore.
        await TeamCash.updateOne({ key: 'team-cash' }, { $inc: { __v: 1 } }, { session });
        const existing = await CashReceipt.find({}).select('-data').session(session).lean();
        receipt = existing.find(row => row.transactionId === req.params.id && row.sha256 === file.sha256);
        if (receipt) return;
        if (existing.reduce((sum, row) => sum + row.size, 0) + file.size > MAX_TOTAL) fail('Die Belegablage ist voll (32 MB). Bitte vor weiteren Uploads eine Speichererweiterung einplanen.');
        if (existing.filter(row => row.transactionId === req.params.id).length >= 10) fail('Pro Buchung sind höchstens zehn Belege möglich.');
        [receipt] = await CashReceipt.create([{ ...file, transactionId: req.params.id, createdBy: req.auth.username }], { session });
      });
    } finally { await session.endSession(); }
    res.status(201).json(meta(receipt));
  }));
  app.get('/team-cash/transactions/:id/receipts/:receiptId', access, wrap(async (req, res) => {
    await transaction(req.params.id, req.auth);
    if (!/^[a-f\d]{24}$/i.test(req.params.receiptId)) fail('Ungültiger Beleg.');
    const receipt = await CashReceipt.findOne({ _id: req.params.receiptId, transactionId: req.params.id }).lean();
    if (!receipt) fail('Beleg nicht gefunden.', 404);
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox; default-src 'none'", 'Content-Disposition': `attachment; filename="Beleg"; filename*=UTF-8''${encodeURIComponent(receipt.name)}`, 'Content-Type': receipt.type });
    res.send(Buffer.from(receipt.data, 'base64'));
  }));
};
