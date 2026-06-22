/**
 * Tenant scope helpers — businessId filtresinin tek noktadan yönetimi.
 */

function requireBusinessId(businessId) {
  if (!businessId || typeof businessId !== 'string') {
    const err = new Error('businessId gerekli');
    err.status = 403;
    throw err;
  }
  return businessId;
}

/** Sorguya zorunlu businessId filtresi ekler. */
function withBusinessId(businessId, query = {}) {
  return { ...query, businessId: requireBusinessId(businessId) };
}

/** businessId yoksa sorguyu olduğu gibi döner (migration / admin araçları). */
function withBusinessIdOptional(businessId, query = {}) {
  if (!businessId) return { ...query };
  return { ...query, businessId: String(businessId) };
}

function belongsToBusiness(doc, businessId) {
  if (!doc || !businessId) return false;
  return String(doc.businessId) === String(businessId);
}

function assertBusinessAccess(doc, businessId, message = 'Bu kayda erişim yetkiniz yok') {
  if (!belongsToBusiness(doc, businessId)) {
    const err = new Error(message);
    err.status = 403;
    throw err;
  }
  return doc;
}

module.exports = {
  requireBusinessId,
  withBusinessId,
  withBusinessIdOptional,
  belongsToBusiness,
  assertBusinessAccess,
};
