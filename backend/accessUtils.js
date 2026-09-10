const ACCESS_KEYS = Object.freeze(['training', 'checklists', 'teamGenerator', 'teamCash']);

const permissionsFor = user => Object.fromEntries(
  ACCESS_KEYS.map(key => [key, user?.permissions?.[key] !== false])
);

const isAdminUser = (user, mainAdminName = 'Matthias') =>
  user?.name === mainAdminName || user?.isAdmin === true;

const mayAccess = (user, accessKey, mainAdminName = 'Matthias') =>
  isAdminUser(user, mainAdminName) || permissionsFor(user)[accessKey] !== false;

const cashPermissionsFor = (user, mainAdminName = 'Matthias') => {
  const primary = user?.name === mainAdminName;
  const access = isAdminUser(user, mainAdminName) || permissionsFor(user).teamCash;
  const canDelete = access && (isAdminUser(user, mainAdminName) || user?.cashPermissions?.canDelete === true);
  return {
    canDelete,
    canViewDeleted: primary || (canDelete && user?.cashPermissions?.canViewDeleted === true),
  };
};

const backupPermissionsFor = user => ({
  canFullBackup: user?.name === 'Matthias' || user?.backupPermissions?.canFullBackup === true,
  canExport: user?.backupPermissions?.canFullBackup === true || isAdminUser(user) || user?.backupPermissions?.canExport === true,
  canImport: user?.backupPermissions?.canFullBackup === true || isAdminUser(user) || user?.backupPermissions?.canImport === true,
});

module.exports = { ACCESS_KEYS, permissionsFor, isAdminUser, mayAccess, cashPermissionsFor, backupPermissionsFor };
