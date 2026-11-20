import { useEffect, useState } from 'react';
import { formatDate } from '../lib/api';

export function repositoryPath(url: string) {
  const match = /^https:\/\/github\.com\/([a-z\d-]{1,39})\/([a-z\d._-]{1,100})\/?$/i.exec(url.trim());
  if (!match || /^\.{1,2}$/.test(match[2])) return null;
  return match[1] + '/' + match[2].replace(/\.git$/i, '');
}

export function RepositoryLink({url}: {url:string}) {
  const path = repositoryPath(url);
  const [activity, setActivity] = useState<{path:string; date:string | null} | null>(null);
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch('https://api.github.com/repos/' + path, {signal:controller.signal});
        if (!response.ok) throw new Error();
        const repo = await response.json();
        setActivity({path, date:repo.pushed_at ?? null});
      } catch {
        if (!controller.signal.aborted) setActivity({path, date:null});
      }
    }, 500);
    return () => {window.clearTimeout(timer); controller.abort();};
  }, [path]);
  if (!path) return null;
  return <div className="repository-summary">
    <a href={'https://github.com/' + path} target="_blank" rel="noreferrer">{path}</a>
    <small>{activity?.path !== path ? 'Consultando GitHub…' : activity.date
      ? 'Último push en GitHub · ' + formatDate(activity.date)
      : 'Fecha del último push no disponible'}</small>
  </div>;
}
