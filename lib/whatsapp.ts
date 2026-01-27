export function sanitizePhone(raw?: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D+/g, "");
  return digits.length > 0 ? digits : null;
}

export function resolvePhone(
  brokerPhoneE164?: string | null,
  brokerPhone?: string | null,
  fallbackEnv?: string | null
): string | null {
  return (
    sanitizePhone(brokerPhoneE164) ||
    sanitizePhone(brokerPhone) ||
    sanitizePhone(fallbackEnv)
  );
}

export function buildWhatsAppLink(phone: string | null, message?: string): string | null {
  if (!phone) return null;
  const text = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${phone}${text}`;
}
