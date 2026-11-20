import { App } from 'octokit';

export type AssignmentConfig = { owner: string; installationId: number; templates: string[] };

export function assignmentConfig(): Record<string, AssignmentConfig> {
  try {
    const map = JSON.parse(process.env.ASSIGNMENT_GITHUB_INSTITUTIONS ?? '{}');
    return Object.fromEntries(Object.entries(map).filter(([, value]) => {
      const item = value as AssignmentConfig;
      return item && typeof item.owner === 'string' && /^[a-z0-9-]+$/i.test(item.owner)
        && Number.isSafeInteger(item.installationId) && item.installationId > 0
        && Array.isArray(item.templates) && item.templates.every(t => typeof t === 'string');
    })) as Record<string, AssignmentConfig>;
  } catch {
    return {};
  }
}

type Reservation = { id: string; owner: string; name: string; template: string };
export async function generateAssignment(config: AssignmentConfig, row: Reservation, student: string, teachers: string[]) {
  const appId = process.env.ASSIGNMENT_GITHUB_APP_ID;
  const privateKey = process.env.ASSIGNMENT_GITHUB_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!appId || !privateKey) throw new Error('REPOSITORIES_UNCONFIGURED');
  const app = new App({ appId, privateKey });
  const installation = await app.octokit.rest.apps.getInstallation({ installation_id: config.installationId });
  const account = installation.data.account;
  if (installation.data.target_type !== 'Organization' || !account || !('login' in account) || account.login.toLowerCase() !== row.owner) {
    throw new Error('REPOSITORIES_UNCONFIGURED');
  }
  const client = await app.getInstallationOctokit(config.installationId);
  const params = { owner: row.owner, repo: row.name };
  const marker = 'WebClass assignment ' + row.id;
  const lookup = () => client.rest.repos.get(params).then(r => r.data);
  const status = (error: unknown) => (error as { status?: number })?.status;
  let repo = await lookup().catch(error => {
    if (status(error) !== 404) throw error;
    return null;
  });
  if (!repo) {
    const [template_owner, template_repo] = row.template.split('/');
    const source = await client.rest.repos.get({ owner: template_owner, repo: template_repo });
    const authorizedPrivate = config.templates.some(t => t.toLowerCase() === source.data.full_name.toLowerCase());
    if (!source.data.is_template || (source.data.visibility !== 'public' && !authorizedPrivate)) throw new Error('INVALID_TEMPLATE');
    try {
      await client.rest.repos.createUsingTemplate({
        template_owner, template_repo, owner: row.owner, name: row.name, private: true, description: marker,
      });
    } catch (error) {
      if (status(error) !== 422) throw error;
      // A concurrent acceptance may have generated the same reservation.
    }
    repo = await lookup();
  }
  if (!repo.private || repo.description !== marker || repo.full_name.toLowerCase() !== row.owner + '/' + row.name) {
    throw new Error('REPOSITORY_CONFLICT');
  }
  for (const id of new Set([student, ...teachers])) {
    const account = await client.request('GET /user/{account_id}', { account_id: Number(id) });
    if (String(account.data.id) !== id) throw new Error('GITHUB_ACCOUNT_UNAVAILABLE');
    await client.rest.repos.addCollaborator({ ...params, username: account.data.login, permission: id === student ? 'push' : 'pull' });
  }
  return repo.html_url;
}
