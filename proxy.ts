import createMiddleware from "next-intl/middleware";

import { routing } from "./lib/i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Run on every path except Next internals, the API, and anything with a file
  // extension (static assets, the OG image route's own assets, favicons).
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
