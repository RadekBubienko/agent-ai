import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {

  if (request.nextUrl.pathname.startsWith("/video")) {

    const hasAccess = request.cookies.get("lead_access");

    if (!hasAccess) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }

  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/video/:path*"],
};