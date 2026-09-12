module.exports = function registerCashRemovalRoutes({ app, mongoose, TeamCash, CashReceipt, requireCashPermission }) {
  const access = requireCashPermission('canDelete');
  app.get('/team-cash/deleted-removal', access, async (_req, res) => {
    try {
      const cash = await TeamCash.findOne({ key: 'team-cash' }).lean();
      res.set('Cache-Control', 'no-store');
      res.json((cash?.transactions || []).filter(row => row.deletedAt).map(row => ({
        _id: row._id, date: row.date, type: row.type, amountCents: row.amountCents,
        purpose: row.purpose, person: row.person,
      })));
    } catch (_) { res.status(500).json({ error: 'Gelöschte Buchungen konnten nicht geladen werden.' }); }
  });
  app.delete('/team-cash/transactions/:id/permanent', access, async (req, res) => {
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(400).json({ error: 'Ungültige Buchung.' });
    let session;
    try {
      session = await mongoose.startSession();
      await session.withTransaction(async () => {
        const id = req.params.id;
        const deleted = { _id: id, deletedAt: { $type: 'date' } };
        const result = await TeamCash.updateOne(
          { key: 'team-cash', transactions: { $elemMatch: deleted } },
          { $pull: { transactions: deleted } }, { session }
        );
        if (!result.modifiedCount) throw Object.assign(new Error('Die Buchung wurde nicht gefunden oder ist nicht gelöscht.'), { status: 404 });
        await CashReceipt.deleteMany({ transactionId: id }, { session });
      });
      res.json({ ok: true });
    } catch (error) {
      res.status(error.status || 500).json({ error: error.status ? error.message : 'Endgültiges Löschen fehlgeschlagen. Bitte erneut versuchen.' });
    } finally { if (session) await session.endSession(); }
  });
};
