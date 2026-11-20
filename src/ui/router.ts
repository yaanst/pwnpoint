import { useEffect, useState } from 'preact/hooks';

/** Current route from the URL hash, e.g. "#/settings" → "/settings". Defaults to "/". */
export function routeFromHash(hash: string): string {
  const path = hash.replace(/^#/, '');
  return path.startsWith('/') ? path : '/';
}

export type Page =
  | { name: 'findings' }
  | { name: 'finding'; id: string }
  | { name: 'cvss' }
  | { name: 'settings' }
  | { name: 'not-found' };

/** Maps a route to a page. Ids are opaque and URL-decoded. */
export function matchRoute(route: string): Page {
  const parts = route.split('/').filter(Boolean);
  if (parts.length === 0 || (parts.length === 1 && parts[0] === 'findings')) {
    return { name: 'findings' };
  }
  if (parts.length === 2 && parts[0] === 'findings' && parts[1]) {
    try {
      return { name: 'finding', id: decodeURIComponent(parts[1]) };
    } catch {
      return { name: 'not-found' };
    }
  }
  if (parts.length === 1 && parts[0] === 'cvss') return { name: 'cvss' };
  if (parts.length === 1 && parts[0] === 'settings') return { name: 'settings' };
  return { name: 'not-found' };
}

export const findingHref = (id: string) => `#/findings/${encodeURIComponent(id)}`;

export function useHashRoute(): string {
  const [route, setRoute] = useState(() => routeFromHash(location.hash));
  useEffect(() => {
    const onChange = () => setRoute(routeFromHash(location.hash));
    addEventListener('hashchange', onChange);
    return () => removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
