#!/usr/bin/env node
/**
 * normalizePhoneNumber birim testleri.
 *
 * Kullanım: node scripts/test-normalize-phone.js
 */
require('dotenv').config();

delete require.cache[require.resolve('../services/authService')];
const { normalizePhoneNumber } = require('../services/authService');

function assertEqual(actual, expected, input) {
  if (actual !== expected) {
    throw new Error(`"${input}" → "${actual}" (beklenen: "${expected}")`);
  }
}

const cases = [
  ['05351112233', '+905351112233'],
  ['5351112233', '+905351112233'],
  ['905351112233', '+905351112233'],
  ['+905351112233', '+905351112233'],
  ['0535 111 22 33', '+905351112233'],
  ['+90 535 111 22 33', '+905351112233'],
  ['00905351112233', '+905351112233'],
  // Demo kullanıcı — mevcut DB kaydı +905551112233 ile uyumlu girişler
  ['05551112233', '+905551112233'],
  ['5551112233', '+905551112233'],
  ['+905551112233', '+905551112233'],
  ['', ''],
  [null, ''],
  ['123', ''],
];

for (const [input, expected] of cases) {
  assertEqual(normalizePhoneNumber(input), expected, input);
}

console.log('✅ normalizePhoneNumber tests passed');
