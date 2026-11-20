import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { generateAssignment } from '../../apps/api/src/assignment-github.js';

const github = vi.hoisted(() => ({
  getInstallation: vi.fn(),
  get: vi.fn(),
  createUsingTemplate: vi.fn(),
  addCollaborator: vi.fn(),
  request: vi.fn(),
}));
vi.mock('octokit', () => ({
  App: class {
    octokit = { rest: { apps: github } };
    async getInstallationOctokit() {
      return { rest: { repos: github }, request: github.request };
    }
  },
}));
const config = { owner: 'class', installationId: 7, templates: [] };
const row = { id: 'assignment-id', owner: 'class', name: 'tarea-ana', template: 'prof/tarea' };
const repo = { private: true, description: 'WebClass assignment assignment-id', full_name: 'class/tarea-ana', html_url: 'https://github.com/class/tarea-ana' };
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('ASSIGNMENT_GITHUB_APP_ID', '1');
  vi.stubEnv('ASSIGNMENT_GITHUB_PRIVATE_KEY', 'test');
  github.getInstallation.mockResolvedValue({ data: { target_type: 'Organization', account: { login: 'class' } } });
  github.request.mockImplementation(async (_route, { account_id }) => ({ data: { id: account_id, login: account_id === 1 ? 'ana' : 'prof' } }));
});
afterEach(() => vi.unstubAllEnvs());

it('creates a private copy and assigns student write and teacher read access', async () => {
  github.get.mockRejectedValueOnce({ status: 404 })
    .mockResolvedValueOnce({ data: { is_template: true, visibility: 'public', full_name: row.template } })
    .mockResolvedValueOnce({ data: repo });
  expect(await generateAssignment(config, row, '1', ['2'])).toBe(repo.html_url);
  expect(github.createUsingTemplate).toHaveBeenCalledWith(expect.objectContaining({ private: true, name: row.name, template_owner: 'prof' }));
  expect(github.addCollaborator.mock.calls.map(([input]) => [input.username, input.permission])).toEqual([['ana','push'],['prof','pull']]);
});
it('resumes a previous creation after a failed invitation', async () => {
  github.get.mockResolvedValue({ data: repo });
  github.addCollaborator.mockRejectedValueOnce(new Error('timeout'));
  await expect(generateAssignment(config, row, '1', [])).rejects.toThrow('timeout');
  expect(await generateAssignment(config, row, '1', [])).toBe(repo.html_url);
  expect(github.createUsingTemplate).not.toHaveBeenCalled();
});
it('never invites a student to an unrelated repository with the same name', async () => {
  github.get.mockResolvedValue({ data: { ...repo, description: 'Another project' } });
  await expect(generateAssignment(config, row, '1', [])).rejects.toThrow('REPOSITORY_CONFLICT');
  expect(github.addCollaborator).not.toHaveBeenCalled();
});
it('rejects private templates not approved for this institution', async () => {
  github.get.mockRejectedValueOnce({ status: 404 })
    .mockResolvedValueOnce({ data: { is_template: true, visibility: 'private', full_name: row.template } });
  await expect(generateAssignment(config, row, '1', [])).rejects.toThrow('INVALID_TEMPLATE');
  expect(github.createUsingTemplate).not.toHaveBeenCalled();
});
