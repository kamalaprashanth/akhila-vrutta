/** The calculator in Add transaction: a sum like 450+120×2 worked out (× and ÷ first), to 2 decimals; null if it isn't one. */
export function calcValue(ex: string): number | null {
  const toks = ex.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-").match(/\d+(?:\.\d+)?|\.\d+|[-+*/]/g);
  if (!toks) return null;
  // numbers and operators, alternating; × and ÷ first
  const nums: number[] = [], ops: string[] = [];
  let want = "n";
  for (const t of toks) {
    if (want === "n") { if (!/\d/.test(t)) return null; nums.push(parseFloat(t)); want = "o"; }
    else { ops.push(t); want = "n"; }
  }
  if (want === "n") ops.pop();   // a trailing operator is ignored
  const n2 = [nums[0]!], o2: string[] = [];
  ops.forEach((o, i) => {
    const b = nums[i + 1]!, last = n2.length - 1;
    if (o === "*") n2[last] = n2[last]! * b;
    else if (o === "/") n2[last] = b ? n2[last]! / b : NaN;
    else { o2.push(o); n2.push(b); }
  });
  let v = n2[0]!;
  o2.forEach((o, i) => { v = o === "+" ? v + n2[i + 1]! : v - n2[i + 1]!; });
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
}
