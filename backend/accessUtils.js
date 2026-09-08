const ACCESS_KEYS = Object.freeze(['training', 'checklists', 'teamGenerator', 'teamCash']);

const permissionsFor = user => Object.fromEntries(
  ACCESS_KEYS.map(key => [key, user?.permissions?.[key] !== false])
);

const isAdminUser = (user, mainAdminName = 'Matthias') =>
  user?.name === mainAdminName || user?.isAdmin === true;

const mayAccess = (user, accessKey, mainAdminName = 'Matthias') =>
  isAdminUser(user, mainAdminName) || permissionsFor(user)[accessKey] !== false;

module.exports = { ACCESS_KEYS, permissionsFor, isAdminUser, mayAccess };
