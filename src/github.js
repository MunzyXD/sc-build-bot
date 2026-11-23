import { config } from './config.js';
const headers = { Authorization: `Bearer ${config.githubToken}`, Accept: 'application/vnd.github+json',
 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'SC-APK-Build-Bot' };
async function request(endpoint, options={}) {
 const response = await fetch(`${config.githubApiUrl}${endpoint}`, { ...options, headers:{...headers,...(options.headers||{})} });
 const body = await response.text(); let data;
 try { data = body ? JSON.parse(body) : {}; } catch { data = {message:body}; }
 if (!response.ok) throw new Error(`GitHub API ${response.status}: ${data.message||response.statusText}`);
 return data;
}
function validateRepo(repo) { if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) throw new Error('Format repository harus owner/repo.'); }
export async function getRepository(repo) { validateRepo(repo); return request(`/repos/${repo}`); }
export async function validateBranch(repo, branch) {
 validateRepo(repo);
 if (!/^[A-Za-z0-9._/-]+$/.test(branch) || branch.includes('..')) throw new Error('Nama branch tidak valid.');
 return request(`/repos/${repo}/branches/${encodeURIComponent(branch)}`);
}
export async function dispatchBuild(repo, branch, variant, buildId) {
 validateRepo(repo);
 await request(`/repos/${repo}/actions/workflows/build.yml/dispatches`, {
  method:'POST', headers:{'Content-Type':'application/json'},
  body:JSON.stringify({ref:branch,inputs:{variant,artifact_name:`android-apk-build-${buildId}`}})
 });
 return {dispatchedAt:new Date().toISOString()};
}
export async function findWorkflowRun(repo, branch, since) {
 const data = await request(`/repos/${repo}/actions/workflows/build.yml/runs?branch=${encodeURIComponent(branch)}&event=workflow_dispatch&per_page=20`);
 const threshold = new Date(since).getTime()-30000;
 return (data.workflow_runs||[]).filter(r=>new Date(r.created_at).getTime()>=threshold)
  .sort((a,b)=>new Date(b.created_at)-new Date(a.created_at))[0] || null;
}
export async function getWorkflowRun(repo,id) { return request(`/repos/${repo}/actions/runs/${id}`); }
export async function cancelWorkflowRun(repo,id) { return request(`/repos/${repo}/actions/runs/${id}/cancel`,{method:'POST'}); }
export async function getArtifacts(repo,id) { const d=await request(`/repos/${repo}/actions/runs/${id}/artifacts`); return d.artifacts||[]; }
export async function downloadArtifact(repo,id) {
 const response=await fetch(`${config.githubApiUrl}/repos/${repo}/actions/artifacts/${id}/zip`,{headers,redirect:'follow'});
 if(!response.ok) throw new Error(`Gagal mengunduh artifact: HTTP ${response.status}`);
 return Buffer.from(await response.arrayBuffer());
}
