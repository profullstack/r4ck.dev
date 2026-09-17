/**
 * USD per unit of each currency the catalogue bills in. A static table the
 * deployment can override (FX_RATES_JSON) and the sync worker refreshes from
 * frankfurter.app daily. Estimates, labelled as such everywhere they show.
 */
export const DEFAULT_RATES = Object.freeze({
  USD: 1,
  EUR: 1.09,
  GBP: 1.27,
  CAD: 0.73,
  AUD: 0.66,
  CHF: 1.13,
  SEK: 0.095,
  NOK: 0.093,
  DKK: 0.146,
  PLN: 0.25,
  CZK: 0.043,
  HUF: 0.0027,
  RON: 0.22,
  BGN: 0.56,
  TRY: 0.029,
  INR: 0.012,
  JPY: 0.0067,
  SGD: 0.75,
  HKD: 0.128,
  NZD: 0.6,
  ZAR: 0.055,
  BRL: 0.18,
  MXN: 0.052,
  ILS: 0.27,
  MAD: 0.1,
  KES: 0.0077,
  MYR: 0.22,
  UAH: 0.024,
  RUB: 0.011,
  PHP: 0.017,
  IDR: 0.000063,
  THB: 0.028,
  VND: 0.00004,
  ARS: 0.001,
  KRW: 0.00073,
  TWD: 0.031,
  AED: 0.27,
  SAR: 0.27,
  EGP: 0.02,
  NGN: 0.00065,
  PKR: 0.0036,
  BDT: 0.0084,
  LKR: 0.0033,
  CLP: 0.0011,
  COP: 0.00024,
  PEN: 0.27,
});

/** Months per billing term, so any price becomes a monthly one. */
export const MONTHS_PER_INTERVAL = Object.freeze({
  hour: 1 / 730,
  day: 1 / 30.4,
  week: 1 / 4.345,
  month: 1,
  quarter: 3,
  'semi-annual': 6,
  semiannual: 6,
  year: 12,
  biennial: 24,
  triennial: 36,
});

/**
 * A price as billed, made monthly and in USD. Null when it cannot be made
 * honestly: an unknown currency or no stated billing term. A guess would be
 * sorted and compared against real numbers, which is worse than a blank.
 */
export function monthlyUsd({ amount, currency, interval }, rates = DEFAULT_RATES) {
  const a = Number(amount);
  if (!Number.isFinite(a) || a < 0) return null;
  const months = MONTHS_PER_INTERVAL[String(interval ?? '').toLowerCase()];
  if (!months) return null;
  const rate = rates[String(currency ?? '').toUpperCase()];
  if (!rate) return null;
  return round((a / months) * rate, 4);
}

export function hourlyUsd(monthly) {
  return monthly === null || monthly === undefined ? null : round(Number(monthly) / 730, 5);
}

export function round(n, places = 2) {
  const f = 10 ** places;
  return Math.round(Number(n) * f) / f;
}

/** Fetch today's USD rates. Frankfurter is keyless ECB data. */
export async function fetchRates(fetchImpl = fetch) {
  const r = await fetchImpl('https://api.frankfurter.app/latest?from=USD');
  if (!r.ok) throw new Error(`frankfurter ${r.status}`);
  const body = await r.json();
  const out = { USD: 1 };
  for (const [code, perUsd] of Object.entries(body.rates ?? {})) {
    if (Number(perUsd) > 0) out[code] = round(1 / Number(perUsd), 8);
  }
  return out;
}
