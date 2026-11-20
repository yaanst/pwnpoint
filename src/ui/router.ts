import { useEffect, useState } from 'preact/hooks';

/** Current route from the URL hash, e.g. "#/settings" → "/settings". Defaults to "/". */
export function routeFromHash(hash: string): string {
  const path = hash.replace(/^#/, '');
  return path.startsWith('/') ? path : '/';
}

export function useHashRoute(): string {
  const [route, setRoute] = useState(() => routeFromHash(location.hash));
  useEffect(() => {
    const onChange = () => setRoute(routeFromHash(location.hash));
    addEventListener('hashchange', onChange);
    return () => removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
