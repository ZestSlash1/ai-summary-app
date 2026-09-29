import test from 'node:test';
import assert from 'node:assert/strict';

export function safeEvaluate(expr) {
  // Only permit digits, whitespace, decimal points, parentheses, and + - * / operators
  if (!/^[\d\s+\-*/.()]+$/.test(expr)) {
    throw new Error('Invalid characters in arithmetic expression');
  }
  // Safe math evaluation with recursive descent / tokenized parser
  const sanitized = expr.replace(/\s+/g, '');
  const tokens = sanitized.match(/(\d+\.?\d*|[+\-*/()])/g);
  if (!tokens || tokens.join('') !== sanitized) {
    throw new Error('Malformed expression');
  }
  let pos = 0;
  function parsePrimary() {
    const token = tokens[pos++];
    if (token === '(') {
      const val = parseExpression();
      if (tokens[pos++] !== ')') throw new Error('Mismatched parentheses');
      return val;
    }
    if (token === '-') return -parsePrimary();
    if (token === '+') return parsePrimary();
    const num = parseFloat(token);
    if (isNaN(num)) throw new Error(`Unexpected token: ${token}`);
    return num;
  }
  function parseFactor() {
    let left = parsePrimary();
    while (pos < tokens.length && (tokens[pos] === '*' || tokens[pos] === '/')) {
      const op = tokens[pos++];
      const right = parsePrimary();
      left = op === '*' ? left * right : left / right;
    }
    return left;
  }
  function parseExpression() {
    let left = parseFactor();
    while (pos < tokens.length && (tokens[pos] === '+' || tokens[pos] === '-')) {
      const op = tokens[pos++];
      const right = parseFactor();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }
  const result = parseExpression();
  if (pos !== tokens.length) throw new Error('Unconsumed tokens');
  return result;
}

test('evaluates valid arithmetic', () => {
  assert.equal(safeEvaluate('12 * (4 + 3)'), 84);
  assert.equal(safeEvaluate('100 / 4 - 5 * 2'), 15);
  assert.equal(safeEvaluate('-5 + 10'), 5);
  assert.equal(safeEvaluate('3.5 * 2'), 7);
});

test('rejects unsafe expressions and code injection', () => {
  assert.throws(() => safeEvaluate('process.exit(1)'));
  assert.throws(() => safeEvaluate('alert(1)'));
  assert.throws(() => safeEvaluate('Function("return 1")()'));
  assert.throws(() => safeEvaluate('12; require("fs")'));
});
