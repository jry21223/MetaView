/** Number formatting shared by the chemistry cases: screen text, markup and speech. */

/** Round to `digits` and drop trailing zeros. */
export function num(value: number, digits = 2): string {
  const rounded = Number(value.toFixed(digits));
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

/** Fixed decimals, for readings that keep their precision (20.00 mL, 1.10 V). */
export function dec(value: number, digits = 2): string {
  // −0.0001 must not print as "-0.00".
  const text = value.toFixed(digits);
  return /^-0(\.0+)?$/.test(text) ? text.slice(1) : text;
}

/** Signed with a true minus: "−0.76", "+0.34". */
export function signed(value: number, digits = 2): string {
  const text = Math.abs(value).toFixed(digits);
  return value < 0 ? `−${text}` : `+${text}`;
}

export function scientific(value: number, digits = 2): { mantissa: string; exponent: number } {
  let exponent = Math.floor(Math.log10(Math.abs(value)));
  let mantissa = value / 10 ** exponent;
  // 9.96 at two digits rounds to 10.0: carry into the exponent.
  if (Number(mantissa.toFixed(digits - 1)) >= 10) {
    exponent += 1;
    mantissa /= 10;
  }
  return { mantissa: mantissa.toFixed(digits - 1), exponent };
}

/** `1.9×10^{-14}` (chem markup). */
export function scientificMarkup(value: number, digits = 2): string {
  const { mantissa, exponent } = scientific(value, digits);
  return exponent === 0 ? mantissa : `${mantissa}×10^{${exponent}}`;
}

/** "1.9 乘以 10 的负 14 次方" — for narration. */
export function scientificSpoken(value: number, digits = 2): string {
  const { mantissa, exponent } = scientific(value, digits);
  if (exponent === 0) return mantissa;
  return `${mantissa} 乘以 10 的${exponent < 0 ? "负 " : " "}${Math.abs(exponent)} 次方`;
}

/** A relative error as screen text: "−0.08%", "+0.003%", "< 0.001%". */
export function percentText(relative: number): string {
  const percent = relative * 100;
  if (Math.abs(percent) < 0.001) return "< 0.001%";
  const digits = Math.abs(percent) >= 0.1 ? 2 : 3;
  return `${percent < 0 ? "−" : "+"}${Math.abs(percent).toFixed(digits)}%`;
}

/** The same error in words for narration: "偏小约百分之 0.08". */
export function percentSpoken(relative: number): string {
  const percent = relative * 100;
  if (Math.abs(percent) < 0.001) return "不到十万分之一";
  const digits = Math.abs(percent) >= 0.1 ? 2 : 3;
  return `${percent < 0 ? "偏小" : "偏大"}约百分之 ${Math.abs(percent).toFixed(digits)}`;
}

/** A large ratio in Chinese units for narration: 250000 → "25 万", 2.5e7 → "2500 万". */
export function ratioSpoken(ratio: number): string {
  // "约 2500 倍", not "约 2502 倍": a spoken ratio keeps two significant figures.
  const step = 10 ** (Math.floor(Math.log10(Math.max(ratio, 1))) - 1);
  const rounded = Math.round(ratio / step) * step;
  if (rounded >= 1e8) return `${num(rounded / 1e8, 1)} 亿`;
  if (rounded >= 1e4) return `${num(rounded / 1e4, 0)} 万`;
  return num(rounded, 0);
}
