'use strict';

const jwt = require('jsonwebtoken');

const isProd = process.env.NODE_ENV === 'production';
const JWT_SECRET = process.env.JWT_SECRET || (isProd ? '' : 'ds-default-secret-change-in-prod');
const JWT_EXPIRY = '7d';

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is required in production.');
}

function generateToken(playerId) {
  return jwt.sign({ playerId }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

module.exports = { generateToken, verifyToken };
