const ActivityLog = require('../models/ActivityLog');

function sanitizeIp(ip) {
  return String(ip || '').slice(0, 64);
}

function sanitizeUserAgent(ua) {
  return String(ua || '').slice(0, 256);
}

function actorFromUser(user) {
  if (!user) return { userId: null, email: '', name: '', role: '' };
  return {
    userId: user._id || user.id || null,
    email: String(user.email || ''),
    name: String(user.name || ''),
    role: String(user.role || ''),
  };
}

async function logActivity({
  req,
  actor,
  action,
  statusCode,
  targetUserId,
  targetLetterId,
  meta,
}) {
  try {
    if (!action) return;

    const doc = {
      actor: actor || actorFromUser(req?.res?.locals?.currentUser),
      action: String(action),
      method: String(req?.method || ''),
      path: String(req?.originalUrl || req?.path || ''),
      statusCode: typeof statusCode === 'number' ? statusCode : null,
      ip: sanitizeIp(req?.headers?.['x-forwarded-for'] || req?.ip),
      userAgent: sanitizeUserAgent(req?.headers?.['user-agent']),
      target: {
        userId: targetUserId || null,
        letterId: targetLetterId || null,
      },
      meta: meta && typeof meta === 'object' ? meta : {},
    };

    await ActivityLog.create(doc);
  } catch (error) {
    // Never break request flow on logging
    // eslint-disable-next-line no-console
    console.error('[ActivityLog] failed:', error.message);
  }
}

module.exports = {
  logActivity,
  actorFromUser,
};
