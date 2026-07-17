// Self-hosted cookie/storage consent — no third-party consent service.
// 'all' = anonymous reading analytics allowed; 'essential' = only what the
// site needs to function (auth tokens for editors, theme, this choice).
export type ConsentLevel = 'all' | 'essential';

const CONSENT_KEY = 'apolitics-consent';

export function getConsent(): ConsentLevel | null {
  if (typeof window === 'undefined') return null;
  const value = window.localStorage.getItem(CONSENT_KEY);
  return value === 'all' || value === 'essential' ? value : null;
}

export function setConsent(level: ConsentLevel) {
  window.localStorage.setItem(CONSENT_KEY, level);
  // Declining analytics also discards any previously issued session id —
  // consent withdrawal should erase, not just pause.
  if (level === 'essential') {
    window.localStorage.removeItem('apolitics-session-id');
  }
  window.dispatchEvent(new Event('apolitics-consent-changed'));
}
