// Umami custom events (self-hosted at stats.ontwrpn.com, cookieless).
// No-op when the script is blocked or hasn't loaded; never send free text
// the user typed (search queries stay out of analytics).
export function track(event, data) {
  try {
    window.umami?.track(event, data);
  } catch {
    /* analytics must never break the app */
  }
}
