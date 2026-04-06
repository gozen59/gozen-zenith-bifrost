/**
 * Replace {{var}} placeholders in a template string.
 * @param {string} template
 * @param {Record<string, string|number>} vars
 * @returns {string}
 */
export function renderTemplate(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return vars[key] !== undefined ? String(vars[key]) : match;
  });
}

/**
 * Promise-based delay.
 * @param {number} ms
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Current ISO timestamp.
 * @returns {string}
 */
export function isoNow() {
  return new Date().toISOString();
}

/**
 * Remove sensitive data from config for HTTP exposure.
 * @param {object} config
 * @returns {object}
 */
export function sanitizeConfig(config) {
  const clone = JSON.parse(JSON.stringify(config));
  // Remove anything that could leak secrets
  if (clone.notifications?.telegram) {
    delete clone.notifications.telegram.token;
    delete clone.notifications.telegram.chatId;
  }
  return clone;
}

/**
 * Format a price with locale-aware formatting.
 * @param {number} price
 * @param {string} currency
 * @returns {string}
 */
export function formatPrice(price, currency) {
  try {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(price);
  } catch {
    return `${price} ${currency.toUpperCase()}`;
  }
}
