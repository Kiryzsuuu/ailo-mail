const User = require('../models/User');

function roleRank(role) {
  switch (String(role || '').toUpperCase()) {
    case 'SUPERADMIN':
      return 4;
    case 'SUPREME':
      return 3;
    case 'ADMIN':
      return 2;
    case 'USER':
      return 1;
    default:
      return 0;
  }
}

async function attachCurrentUser(req, res, next) {
  try {
    const userId = req.session?.userId;
    if (!userId) {
      res.locals.currentUser = null;
      return next();
    }

    const user = await User.findById(userId).lean();
    res.locals.currentUser = user || null;
    return next();
  } catch (error) {
    return next(error);
  }
}

function requireAuth(req, res, next) {
  if (res.locals.currentUser) return next();
  return res.redirect('/login');
}

function requireRole(roles) {
  const required = Array.isArray(roles) ? roles : [roles];
  return (req, res, next) => {
    const user = res.locals.currentUser;
    if (!user) return res.redirect('/login');
    if (String(user.role).toUpperCase() === 'SUPERADMIN') return next();
    if (required.map((r) => String(r).toUpperCase()).includes(String(user.role).toUpperCase())) {
      return next();
    }
    return res.status(403).send('Forbidden');
  };
}

function canManageUsers(user) {
  if (!user) return false;
  const r = String(user.role || '').toUpperCase();
  return r === 'ADMIN' || r === 'SUPERADMIN';
}

function canViewAllLetters(user) {
  if (!user) return false;
  return roleRank(user.role) >= roleRank('ADMIN');
}

function canApproveLetters(user) {
  if (!user) return false;
  return roleRank(user.role) >= roleRank('SUPREME');
}

module.exports = {
  attachCurrentUser,
  requireAuth,
  requireRole,
  canManageUsers,
  canViewAllLetters,
  canApproveLetters,
  roleRank,
};
