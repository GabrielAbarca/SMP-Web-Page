// Vercel Web Analytics — privacy-friendly page views and custom events RUM.
// inject() adds a same-origin /_vercel/insights/script.js tag: no cookies, no
// third-party host. It only reports on a Vercel deployment with Web Analytics
// enabled in the project dashboard; locally it's a no-op.
// Imported for side effect once per entry point (one page load = one injection).
import { inject } from "@vercel/analytics";

inject();
