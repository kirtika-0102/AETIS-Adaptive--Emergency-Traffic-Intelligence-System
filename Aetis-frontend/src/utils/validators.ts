const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** A format check only. Whether the address exists is for the server to find out. */
export function isValidEmail(value: string): boolean {
  if (typeof value !== "string") return false;
  const email = value.trim();
  return email.length > 0 && email.length <= 254 && EMAIL_PATTERN.test(email);
}

/**
 * Digits with an optional leading + and common separators, 7 to 15 digits
 * in all (the international maximum). It does not check the country.
 */
export function isValidPhone(value: string): boolean {
  if (typeof value !== "string") return false;
  const phone = value.trim();

  if (!/^\+?[0-9()\-\s]+$/.test(phone)) return false;

  const digits = phone.replace(/\D/g, "").length;
  return digits >= 7 && digits <= 15;
}