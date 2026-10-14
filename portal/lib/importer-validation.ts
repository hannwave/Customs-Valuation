// Input restrictions and format checks for importer registration. The API applies the same rules.

const digitsOnly = (value: string) => value.replace(/\D/g, "");

/** Keeps only characters each field can legally contain and caps its length while the user types. */
export function restrictTin(value: string) { return digitsOnly(value).slice(0, 10); }

export function restrictPhone(value: string) {
  const plus = value.trimStart().startsWith("+") ? "+" : "";
  return (plus + digitsOnly(value)).slice(0, 16);
}

export function restrictIdNumber(idType: string, value: string) {
  if (idType === "FAYDA") return digitsOnly(value).slice(0, 16).replace(/(\d{4})(?=\d)/g, "$1 ");
  if (idType === "PASSPORT") return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 9);
  return value.toUpperCase().replace(/[^A-Z0-9/-]/g, "").slice(0, 20);
}

export function idNumberMaxLength(idType: string) { return idType === "FAYDA" ? 19 : idType === "PASSPORT" ? 9 : 20; }

export function tinProblem(value: string, required: boolean) {
  const tin = digitsOnly(value);
  if (!tin) return required ? "Enter the 10-digit TIN." : "";
  return tin.length === 10 ? "" : `The TIN has exactly 10 digits (you entered ${tin.length}).`;
}

/** Ethiopian mobiles: 09/07 + 8 digits locally, or +251 9/7 + 8 digits. Diaspora numbers: + country code, 8 to 15 digits. */
export function phoneProblem(value: string) {
  const raw = value.replace(/\s/g, "");
  const digits = digitsOnly(raw);
  if (!digits) return "Enter your mobile phone number.";
  if (raw.startsWith("+251") || (!raw.startsWith("+") && digits.startsWith("251")))
    return /^251[79]\d{8}$/.test(digits) ? "" : "Ethiopian mobile numbers are +251 followed by 9 digits starting with 9 or 7.";
  if (raw.startsWith("0")) return /^0[79]\d{8}$/.test(digits) ? "" : "Local mobile numbers have 10 digits and start with 09 or 07.";
  if (raw.startsWith("+")) return /^\d{8,15}$/.test(digits) ? "" : "International numbers need the country code and 8 to 15 digits.";
  return "Start with 09, 07, +251 or your country code, for example +44.";
}

export function idNumberProblem(idType: string, value: string) {
  const id = value.replace(/\s/g, "").toUpperCase();
  if (!id) return "Enter the identity document number.";
  if (idType === "FAYDA") return /^(\d{12}|\d{16})$/.test(id) ? "" : `A Fayda FIN has 12 digits and a FAN has 16 digits (you entered ${digitsOnly(id).length}).`;
  if (idType === "PASSPORT") return /^[A-Z0-9]{6,9}$/.test(id) ? "" : "Passport numbers have 6 to 9 letters and digits.";
  return /^[A-Z0-9/-]{4,20}$/.test(id) ? "" : "Use 4 to 20 letters, digits, slashes or hyphens as printed on the document.";
}

export function idNumberHint(idType: string, value: string) {
  const count = value.replace(/\s/g, "").length;
  if (idType === "FAYDA") return `${count}/16 · 12-digit FIN or 16-digit FAN from your Fayda card.`;
  if (idType === "PASSPORT") return `${count}/9 · Letters and digits exactly as printed.`;
  return `${count}/20 · As printed on the document.`;
}
