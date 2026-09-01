'use strict';

function toIso(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function fromIso(value) {
  if (value == null || value === '') return null;
  return new Date(value);
}

function nowIso() {
  return new Date().toISOString();
}

function asBool(value) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

function asIntBool(value) {
  return value ? 1 : 0;
}

function notFound(entity) {
  const err = new Error(`${entity} bulunamadı.`);
  err.code = 'not_found';
  throw err;
}

function isUniqueViolation(err) {
  return Boolean(err && String(err.code || '').startsWith('SQLITE_CONSTRAINT_UNIQUE'));
}

function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    isActive: asBool(row.is_active),
    totpSecret: row.totp_secret,
    failedAttempts: row.failed_attempts,
    lockedUntil: fromIso(row.locked_until),
    createdAt: fromIso(row.created_at),
    updatedAt: fromIso(row.updated_at),
  };
}

function mapSession(row, user) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    expiresAt: fromIso(row.expires_at),
    ip: row.ip,
    userAgent: row.user_agent,
    createdAt: fromIso(row.created_at),
    user: user || undefined,
  };
}

function mapDomain(row) {
  if (!row) return null;
  return {
    id: row.id,
    pattern: row.pattern,
    note: row.note,
    isActive: asBool(row.is_active),
    createdBy: row.created_by,
    createdAt: fromIso(row.created_at),
  };
}

function mapLink(row) {
  if (!row) return null;
  const link = {
    id: row.id,
    code: row.code,
    targetUrl: row.target_url,
    title: row.title,
    campaign: row.campaign,
    createdBy: row.created_by,
    isActive: asBool(row.is_active),
    expiresAt: fromIso(row.expires_at),
    createdAt: fromIso(row.created_at),
    updatedAt: fromIso(row.updated_at),
  };
  if (row.creator_email !== undefined) {
    link.creator = row.creator_email ? { email: row.creator_email } : null;
  }
  return link;
}

function mapClickEvent(row) {
  if (!row) return null;
  return {
    id: row.id,
    linkId: row.link_id,
    ts: fromIso(row.ts),
    ipHash: row.ip_hash,
    country: row.country,
    city: row.city,
    device: row.device,
    os: row.os,
    browser: row.browser,
    isBot: asBool(row.is_bot),
  };
}

function mapClickDaily(row) {
  if (!row) return null;
  const daily = {
    linkId: row.link_id,
    date: fromIso(row.date),
    country: row.country,
    isBot: asBool(row.is_bot),
    count: row.count,
  };
  if (row.link_code !== undefined || row.link_title !== undefined || row.link_campaign !== undefined) {
    daily.link = {
      code: row.link_code,
      title: row.link_title,
      campaign: row.link_campaign,
    };
  }
  return daily;
}

function mapAudit(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    action: row.action,
    entity: row.entity,
    entityId: row.entity_id,
    ip: row.ip,
    ts: fromIso(row.ts),
    detailJson: row.detail_json,
    user: row.user_email ? { email: row.user_email } : null,
  };
}

module.exports = {
  toIso,
  fromIso,
  nowIso,
  asBool,
  asIntBool,
  notFound,
  isUniqueViolation,
  mapUser,
  mapSession,
  mapDomain,
  mapLink,
  mapClickEvent,
  mapClickDaily,
  mapAudit,
};
