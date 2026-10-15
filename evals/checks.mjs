// Deterministic checks on Asuka's replies. No API calls, so they're free to run on every case.
import { INVENTORY } from "../lib/inventory";

// How each car is referred to in replies. "M3" alone means the M3 Competition, not the E46 M3.
const ALIASES = {
  "BMW M2 Coupe": /\bM2\b/,
  "BMW M3 Competition xDrive Sedan": /(?<!E46 )\bM3\b(?!(?: Coupe)? E46)/,
  "BMW M4 Competition xDrive Coupe": /\bM4\b(?! CS)/,
  "BMW M4 CS": /\bM4 CS\b/,
  "BMW M5 Touring": /\bM5\b/,
  "BMW M340i xDrive Sedan": /\bM340i\b/,
  "BMW Z4 M40i Handschalter (6-speed manual)": /\bZ4\b/,
  "BMW X5 xDrive40i": /\bX5\b/,
  "BMW X7 xDrive40i (3-row)": /\bX7\b/,
  "BMW iX xDrive60": /\biX\b/,
  "BMW 1 Series M Coupe (pre-owned, 22,000 miles)": /\b1 Series M\b|\b1M\b/,
  "BMW M3 Coupe E46 6-speed (pre-owned, 61,000 miles)": /\bE46\b/,
};
const CARS = INVENTORY.map((car) => ({ car, alias: ALIASES[car.VehicleName] }));
const missing = CARS.filter((c) => !c.alias).map((c) => c.car.VehicleName);
if (missing.length) throw new Error(`evals/checks.mjs: no alias for ${missing.join(", ")}`);

// The stat format the system prompt asks for:
//   BMW M2 Coupe: $66,100, about $1,630/month, 0-60 in 3.9 sec, Reliability 7/10, Fun meter 9/10. 4 on the lot.
const STAT_LINE =
  /\$([\d,]+), about \$([\d,]+)\/month, 0-60 in ([\d.]+) sec, Reliability (\d+)\/10, Fun meter (\d+)\/10\.?(?:\s*(\d+) on the lot)?/g;
const FIELD_NAMES = /\b(EstimatedMonthlyCost|accelerationTo60inSec|VehicleName|BodyStyle|Powertrain)\b|\bavailable\s*[:=]/;
const num = (s) => Number(s.replaceAll(",", ""));

/** Stat lines in a reply, each matched to the car named just before it on the same line. */
export function statLines(text) {
  const out = [];
  for (const m of text.matchAll(STAT_LINE)) {
    const lineStart = text.lastIndexOf("\n", m.index) + 1;
    const label = text.slice(lineStart, m.index);
    // The car named last before the numbers, e.g. "**BMW M4 Competition xDrive Coupe:** $91,000, ..."
    let car = null;
    let at = -1;
    for (const c of CARS) {
      const re = new RegExp(c.alias.source, "g");
      for (const hit of label.matchAll(re)) if (hit.index >= at) [car, at] = [c.car, hit.index];
    }
    out.push({
      car,
      label: label.trim(),
      price: num(m[1]),
      monthly: num(m[2]),
      zeroTo60: Number(m[3]),
      reliability: Number(m[4]),
      fun: Number(m[5]),
      onLot: m[6] == null ? null : Number(m[6]),
    });
  }
  return out;
}

/**
 * Runs every check on a conversation's assistant replies. Case-specific checks (budget, seats)
 * apply to the final reply only, since earlier turns may come before the customer set them.
 * Returns the failures; an empty list means every check passed.
 */
export function runChecks(replies, caseChecks = {}) {
  const failures = [];
  replies.forEach((reply, i) => {
    const turn = replies.length > 1 ? `turn ${i + 1}: ` : "";
    if (/baka/i.test(reply)) failures.push(`${turn}says "baka"`);
    const field = reply.match(FIELD_NAMES);
    if (field) failures.push(`${turn}shows internal field name "${field[0]}"`);

    const stats = statLines(reply);
    for (const s of stats) {
      if (!s.car) {
        failures.push(`${turn}stat line with no recognizable car: "${s.label}"`);
        continue;
      }
      const c = s.car;
      const wrong = [
        s.price !== c.Price && `price $${s.price} (DB $${c.Price})`,
        s.monthly !== c.EstimatedMonthlyCost && `monthly $${s.monthly} (DB $${c.EstimatedMonthlyCost})`,
        s.zeroTo60 !== c.accelerationTo60inSec && `0-60 ${s.zeroTo60}s (DB ${c.accelerationTo60inSec}s)`,
        s.reliability !== c.Reliability && `reliability ${s.reliability} (DB ${c.Reliability})`,
        s.fun !== c.FunMeter && `fun meter ${s.fun} (DB ${c.FunMeter})`,
        s.onLot != null && s.onLot !== c.available && `${s.onLot} on the lot (DB ${c.available})`,
      ].filter(Boolean);
      if (wrong.length) failures.push(`${turn}${c.VehicleName}: ${wrong.join(", ")}`);
    }

    if (i === replies.length - 1) {
      for (const s of stats.filter((s) => s.car)) {
        if (caseChecks.budget != null && s.car.Price > caseChecks.budget) {
          failures.push(`recommends ${s.car.VehicleName} at $${s.car.Price}, over the $${caseChecks.budget} budget`);
        }
        if (caseChecks.min_seats != null && s.car.Seats < caseChecks.min_seats) {
          failures.push(`recommends ${s.car.VehicleName} (${s.car.Seats} seats), needs ${caseChecks.min_seats}+`);
        }
      }
    }
  });
  return failures;
}
