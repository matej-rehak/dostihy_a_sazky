'use strict';

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'ds-default-secret-change-in-prod';
const JWT_EXPIRY = '7d';

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
