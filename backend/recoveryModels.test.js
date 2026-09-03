const test = require('node:test');
const assert = require('node:assert/strict');

const AdminRecovery = require('./models/AdminRecovery');
const PasswordResetRequest = require('./models/PasswordResetRequest');

test('ordnet eine Wiederherstellung genau einem Benutzerkonto zu', async () => {
  const recovery = new AdminRecovery({
    key: 'user:123',
    userId: '123',
    username: 'Sabine',
  });

  await recovery.validate();
  assert.equal(recovery.userId, '123');
  assert.equal(recovery.username, 'Sabine');
  assert.equal(AdminRecovery.schema.path('userId').options.index.unique, true);
  assert.equal(AdminRecovery.schema.path('userId').options.index.sparse, true);
});

test('erlaubt nur eine offene Passwortanfrage je Benutzerkonto', () => {
  const indexes = PasswordResetRequest.schema.indexes();
  const openRequestIndex = indexes.find(
    ([fields, options]) =>
      fields.userId === 1 &&
      options.unique === true &&
      options.partialFilterExpression?.status === 'open'
  );

  assert.ok(openRequestIndex);
});
