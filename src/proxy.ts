import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/env';
import { BUCKETS, EXPERIMENT_COOKIE } from '@/lib/experiment';

/**
 * Keeps the Supabase session cookie fresh, closes the review and administration
 * areas to anyone without one before a page renders, and sets the Content
 * Security Policy.
 *
 * Named `proxy`, not `middleware`: Next 16 renamed the convention.
 */

/**
 * The policy, with a fresh nonce for every request.
 *
 * A nonce has to be unguessable and single-use, so it cannot be prerendered —
 * every HTML route in this app is already server-rendered on demand, which is
 * what makes this possible at all. Next reads the nonce out of the CSP on the
 * *request* headers and stamps it onto its own bootstrap scripts, which is why
 * the header is set twice below.
 *
 * What each allowance is for, so that nobody has to guess later when tightening
 * it breaks something:
 *
 *   script-src   'strict-dynamic' means only nonce-carrying scripts run, plus
 *                whatever they load. `'self'` is ignored by browsers that
 *                understand strict-dynamic and kept for those that do not.
 *                `'unsafe-eval'` in development only — React uses eval to
 *                rebuild server stack traces in the browser, and not in production.
 *
 *   style-src    'unsafe-inline' rather than a nonce, and this is a real
 *                trade-off worth naming. React renders `style={{}}` as an inline
 *                style *attribute*, and a nonce cannot cover an attribute — only
 *                a <style> element. The scroll reveals, the poster's clamped
 *                type and the stream rule all use them, so a nonce-only policy
 *                would ship a broken page. With script locked down, a style
 *                attribute is a defacement vector, not an execution one.
 *
 *   img/media    the Supabase origin: files are served by redirecting to a
 *                signed storage URL, so the bytes come from there and not here.
 *                `blob:` is the lightbox previewing a file before upload.
 *
 *   connect-src  the browser talks to Supabase directly for auth and for
 *                uploading straight to storage, which is what keeps a 50 MB
 *                scan off this server.
 *
 *   frame-src    `blob:` only — the lightbox embeds a locally chosen PDF. No
 *                remote frames anywhere in the archive.
 *
 *   font-src     self. next/font downloads Google's files at build time and
 *                serves them from this origin, so nothing is fetched from Google
 *                at runtime.
 */
function contentSecurityPolicy(nonce: string, isDev: boolean): string {
  const supabase = new URL(SUPABASE_URL).origin;

  /*
   * Measurement hosts, allowed only while measurement is configured.
   *
   * An empty environment variable means the tag can never load, and the policy
   * says so too — two independent statements of the same fact, so switching
   * measurement off cannot leave a door open behind it.
   */
  const measured = Boolean(process.env.NEXT_PUBLIC_GA_ID?.trim());
  const heatmapped = Boolean(process.env.NEXT_PUBLIC_CLARITY_ID?.trim());
  const scriptHosts = [
    measured ? 'https://www.googletagmanager.com' : '',
    heatmapped ? 'https://www.clarity.ms' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const sendHosts = [
    measured ? 'https://www.google-analytics.com https://region1.google-analytics.com' : '',
    heatmapped ? 'https://www.clarity.ms https://x.clarity.ms' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return [
    `default-src 'self'`,
    // 'wasm-unsafe-eval' lets the phone scanner compile OpenCV's WebAssembly
    // (21.09.2026). It permits WebAssembly.compile and nothing else: eval and
    // new Function stay blocked in production.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ''}${scriptHosts ? ` ${scriptHosts}` : ''}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' blob: data: ${supabase}${measured ? ' https://www.google-analytics.com https://www.googletagmanager.com' : ''}`,
    `media-src 'self' blob: ${supabase}`,
    `connect-src 'self' ${supabase}${sendHosts ? ` ${sendHosts}` : ''}${isDev ? ' ws: http://localhost:*' : ''}`,
    `font-src 'self'`,
    `frame-src 'self' blob:`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `upgrade-insecure-requests`,
  ].join('; ');
}

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = contentSecurityPolicy(nonce, process.env.NODE_ENV === 'development');

  // On the request so Next can find the nonce and stamp its own scripts with
  // it; on the response so the browser enforces the policy.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);
  // The path a page is being rendered at. `generateMetadata` has no request
  // object of its own, and without this there is nothing to build a canonical
  // URL from — which is what keeps preview deployments from being indexed as
  // rival copies of the archive.
  requestHeaders.set('x-pathname', request.nextUrl.pathname);

  const withHeaders = () => NextResponse.next({ request: { headers: requestHeaders } });

  let response = withHeaders();

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = withHeaders();
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Both closed areas. The pages check the role as well — this only saves a
  // render for someone with no session at all.
  const closed = ['/review', '/manage'];

  if (!user && closed.some((path) => request.nextUrl.pathname.startsWith(path))) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', request.nextUrl.pathname);

    // The redirect carries the policy too. A response that leaves without it is
    // a response with no policy at all.
    const redirect = NextResponse.redirect(url);
    redirect.headers.set('Content-Security-Policy', csp);
    return redirect;
  }

  response.headers.set('Content-Security-Policy', csp);

  /*
   * One bucket per visitor, assigned once and never re-rolled.
   *
   * It is a number between 0 and 99 and nothing else: not an identifier, not
   * tied to a session, and useless for recognising anybody. It exists so that
   * an A/B test renders the same variant on every page a visitor opens, which
   * is the only way a test measures a choice rather than a coin toss per page.
   */
  if (!request.cookies.get(EXPERIMENT_COOKIE)) {
    response.cookies.set(EXPERIMENT_COOKIE, String(Math.floor(Math.random() * BUCKETS)), {
      path: '/',
      maxAge: 60 * 60 * 24 * 180,
      sameSite: 'lax',
      httpOnly: false,
    });
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
