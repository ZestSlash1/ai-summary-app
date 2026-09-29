/**
 * Safe arithmetic expression evaluator using a recursive descent parser.
 * Replaces unsafe evaluation (eval / Function) to prevent arbitrary code execution.
 */
export function safeEvaluate(expr: string): number {
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
  function parsePrimary(): number {
    const token = tokens![pos++];
    if (token === '(') {
      const val = parseExpression();
      if (tokens![pos++] !== ')') throw new Error('Mismatched parentheses');
      return val;
    }
    if (token === '-') return -parsePrimary();
    if (token === '+') return parsePrimary();
    const num = parseFloat(token);
    if (isNaN(num)) throw new Error(`Unexpected token: ${token}`);
    return num;
  }
  function parseFactor(): number {
    let left = parsePrimary();
    while (pos < tokens!.length && (tokens![pos] === '*' || tokens![pos] === '/')) {
      const op = tokens![pos++];
      const right = parsePrimary();
      left = op === '*' ? left * right : left / right;
    }
    return left;
  }
  function parseExpression(): number {
    let left = parseFactor();
    while (pos < tokens!.length && (tokens![pos] === '+' || tokens![pos] === '-')) {
      const op = tokens![pos++];
      const right = parseFactor();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }
  const result = parseExpression();
  if (pos !== tokens!.length) throw new Error('Unconsumed tokens');
  return result;
}
