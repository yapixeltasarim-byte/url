'use strict';

/**
 * Merkezi izin haritasi (bkz. Bolum 6.2). Yeni bir rol eklendiginde
 * yalnizca bu dosya guncellenir; uc noktalara dokunulmaz.
 * `if (user.role === 'admin')` gibi kontroller uygulamanin icine
 * SERPISTIRILMEZ - hepsi buradan gecer.
 */

const EDITOR_PERMISSIONS = ['link.create', 'link.edit.own', 'link.list.own'];

const MANAGER_PERMISSIONS = [
  ...EDITOR_PERMISSIONS,
  'link.list.all',
  'link.disable',
  'analytics.view',
  'analytics.export',
];

const MATRIX = {
  editor: EDITOR_PERMISSIONS,
  manager: MANAGER_PERMISSIONS,
  admin: ['*'],
};

/** '.own' ekli izinler sahiplik kontrolu gerektirir (bkz. Bolum 4.5 - IDOR). */
function isOwnScoped(permission) {
  return permission.endsWith('.own');
}

function can(user, permission) {
  if (!user || !user.isActive) return false;
  const granted = MATRIX[user.role] || [];
  return granted.includes('*') || granted.includes(permission);
}

/** Admin ('*') her seyi yapabilir; digerleri icin sahiplik ayrica dogrulanmalidir. */
function hasBlanketAccess(user) {
  return (MATRIX[user?.role] || []).includes('*');
}

module.exports = { MATRIX, can, isOwnScoped, hasBlanketAccess };
