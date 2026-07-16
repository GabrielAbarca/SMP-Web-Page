// Vercel Speed Insights — first-party Core Web Vitals RUM (LCP, CLS, INP, …).
// injectSpeedInsights() adds a same-origin /_vercel/speed-insights/script.js
// tag: no cookies, no third-party host. It only reports on a Vercel deployment
// with Speed Insights enabled in the project dashboard; locally it's a no-op.
// Imported for side effect once per entry point (one page load = one injection).
import { injectSpeedInsights } from "@vercel/speed-insights";

injectSpeedInsights();
