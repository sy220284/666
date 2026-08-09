import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const apiRoot = "https://api.github.com";
const supportedTriggers = new Set(["Quality", "Security", "Performance"]);

function env() {
  const {
    GITHUB_TOKEN: token,
    GITHUB_REPOSITORY: repository,
    GITHUB_EVENT_PATH: eventPath,
  } = process.env;
  if (!token || !repository || !eventPath)
    throw new Error("Missing GitHub Actions environment");
  return { token, repository, eventPath };
}

async function apiResponse(token, pathname, options = {}) {
  const url = new URL(pathname, apiRoot);
  if (url.origin !== apiRoot)
    throw new Error(`Unexpected GitHub API origin: ${url.origin}`);
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers ?? {}),
    },
  });
  if (!response.ok) {
    const details = await response.text();
    throw new Error(
      `GitHub API ${response.status}: ${url.pathname}${url.search}\n${details}`,
    );
  }
  return response;
}

async function api(token, pathname, options = {}) {
  const response = await apiResponse(token, pathname, options);
  return response.status === 204 ? null : response.json();
}

export function nextPagePath(linkHeader) {
  if (!linkHeader) return null;
  for (const entry of linkHeader.split(",")) {
    const match = entry.match(/<([^>]+)>;\s*rel="([^"]+)"/u);
    if (!match || match[2] !== "next") continue;
    const url = new URL(match[1]);
    if (url.origin !== apiRoot)
      throw new Error(`Unexpected pagination origin: ${url.origin}`);
    return `${url.pathname}${url.search}`;
  }
  return null;
}

async function pages(token, pathname, key = null) {
  const items = [];
  let next = pathname;
  while (next) {
    const response = await apiResponse(token, next);
    const payload = await response.json();
    const page = key === null ? payload : payload[key];
    if (!Array.isArray(page))
      throw new Error(`GitHub pagination payload is missing ${key ?? "array"}`);
    items.push(...page);
    next = nextPagePath(response.headers.get("link"));
  }
  return items;
}

function signalName(signal) {
  return signal?.name ?? signal?.context ?? null;
}

function signalTime(signal) {
  const timestamp = Date.parse(
    signal?.created_at ?? signal?.updated_at ?? signal?.started_at ?? "",
  );
  return [Number.isFinite(timestamp) ? timestamp : 0, Number(signal?.id ?? 0)];
}

export function latestChecksByName(signals = []) {
  const latest = new Map();
  for (const signal of signals) {
    const name = signalName(signal);
    if (!name) continue;
    const previous = latest.get(name);
    if (
      !previous ||
      signalTime(signal).join(":") > signalTime(previous).join(":")
    )
      latest.set(name, signal);
  }
  return latest;
}

function stateOf(signal) {
  if (!signal) return "pending";
  if (signal.context) {
    if (signal.state === "success") return "success";
    return ["failure", "error"].includes(signal.state) ? "failed" : "pending";
  }
  if (signal.status !== "completed") return "pending";
  return signal.conclusion === "success" ? "success" : "failed";
}

export function requiredCheckState(signals, requiredChecks) {
  const latest = latestChecksByName(signals);
  const pending = [];
  const failed = [];
  for (const name of requiredChecks) {
    const state = stateOf(latest.get(name));
    if (state === "pending") pending.push(name);
    if (state === "failed") failed.push(name);
  }
  return {
    ready: pending.length === 0 && failed.length === 0,
    pending,
    failed,
  };
}

export function modeAwareRunState(kind, workflowRun, jobs = []) {
  if (!workflowRun || workflowRun.status !== "completed")
    return { ready: false, pending: [kind], failed: [] };
  if (workflowRun.conclusion !== "success")
    return { ready: false, pending: [], failed: [kind] };
  const required =
    kind === "quality"
      ? ["quality / quality"]
      : kind === "security"
        ? ["security"]
        : kind === "performance"
          ? ["performance"]
          : [];
  if (required.length === 0)
    throw new Error(`Unknown mode-aware workflow kind: ${kind}`);
  const byName = new Map(jobs.map((job) => [job.name, job]));
  const failed = required.some(
    (name) => stateOf(byName.get(name)) === "failed",
  );
  const pending = required.some(
    (name) => stateOf(byName.get(name)) === "pending",
  );
  return {
    ready: !failed && !pending,
    pending: pending ? [kind] : [],
    failed: failed ? [kind] : [],
  };
}

async function signals(token, owner, repo, sha) {
  const [checks, statuses] = await Promise.all([
    pages(
      token,
      `/repos/${owner}/${repo}/commits/${sha}/check-runs?per_page=100`,
      "check_runs",
    ),
    pages(
      token,
      `/repos/${owner}/${repo}/commits/${sha}/statuses?per_page=100`,
    ),
  ]);
  return [...checks, ...statuses];
}

async function waitChecks(token, owner, repo, sha, requiredChecks) {
  await delay(5_000);
  for (let attempt = 1; attempt <= 90; attempt += 1) {
    const state = requiredCheckState(
      await signals(token, owner, repo, sha),
      requiredChecks,
    );
    if (state.failed.length > 0 || state.ready) return state;
    if (attempt === 90)
      throw new Error(
        `Timed out waiting for checks: ${state.pending.join(", ")}`,
      );
    if (attempt === 1 || attempt % 6 === 0)
      console.log(`Waiting for checks: ${state.pending.join(", ")}`);
    await delay(10_000);
  }
  throw new Error("Check polling ended unexpectedly");
}

async function graphql(token, query, variables) {
  const payload = await api(token, "/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (payload.errors?.length) throw new Error(JSON.stringify(payload.errors));
  return payload.data;
}

async function hasUnresolvedThreads(token, owner, repo, number) {
  let after = null;
  do {
    const data = await graphql(
      token,
      `
        query ($owner: String!, $repo: String!, $number: Int!, $after: String) {
          repository(owner: $owner, name: $repo) {
            pullRequest(number: $number) {
              reviewThreads(first: 100, after: $after) {
                nodes {
                  isResolved
                }
                pageInfo {
                  hasNextPage
                  endCursor
                }
              }
            }
          }
        }
      `,
      { owner, repo, number, after },
    );
    const threads = data.repository.pullRequest.reviewThreads;
    if (threads.nodes.some((thread) => !thread.isResolved)) return true;
    after = threads.pageInfo.hasNextPage ? threads.pageInfo.endCursor : null;
  } while (after);
  return false;
}

export function latestReviewStates(reviews = []) {
  const latest = new Map();
  for (const review of reviews) latest.set(review.user.login, review.state);
  return latest;
}

async function blockedByReview(token, owner, repo, number, config) {
  if (config.blockChangesRequested) {
    const reviews = await pages(
      token,
      `/repos/${owner}/${repo}/pulls/${number}/reviews?per_page=100`,
    );
    if ([...latestReviewStates(reviews).values()].includes("CHANGES_REQUESTED"))
      return true;
  }
  return (
    config.blockUnresolvedThreads &&
    (await hasUnresolvedThreads(token, owner, repo, number))
  );
}

export function mainVerificationDispatchBody(
  config,
  mergeSha,
  number,
  sourceHeadSha,
) {
  if (!/^[0-9a-f]{40}$/iu.test(mergeSha ?? ""))
    throw new Error("Controlled merge must return a full SHA");
  if (!Number.isSafeInteger(number) || number <= 0)
    throw new Error("Invalid pull request number");
  if (!/^[0-9a-f]{40}$/iu.test(sourceHeadSha ?? ""))
    throw new Error("Invalid source head SHA");
  return {
    ref: config.baseBranch,
    inputs: {
      expected_sha: mergeSha,
      source_pr: String(number),
      source_head_sha: sourceHeadSha,
    },
  };
}

async function hasVerification(token, owner, repo, workflow, sha) {
  const runs = await pages(
    token,
    `/repos/${owner}/${repo}/actions/workflows/${encodeURIComponent(workflow)}/runs?event=workflow_dispatch&head_sha=${sha}&per_page=100`,
    "workflow_runs",
  );
  return runs.some((run) => run.head_sha === sha);
}

export async function ensureMainVerification(
  owner,
  repo,
  config,
  mergeSha,
  number,
  sourceHeadSha,
  token = process.env.GITHUB_TOKEN,
) {
  if (!token) throw new Error("GITHUB_TOKEN is required");
  const main = await api(
    token,
    `/repos/${owner}/${repo}/git/ref/heads/${config.baseBranch}`,
  );
  if (main.object.sha !== mergeSha) return;
  if (
    await hasVerification(
      token,
      owner,
      repo,
      config.mainVerificationWorkflow,
      mergeSha,
    )
  )
    return;
  await api(
    token,
    `/repos/${owner}/${repo}/actions/workflows/${encodeURIComponent(config.mainVerificationWorkflow)}/dispatches`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        mainVerificationDispatchBody(config, mergeSha, number, sourceHeadSha),
      ),
    },
  );
}

async function main() {
  const { token, repository, eventPath } = env();
  const [owner, repo] = repository.split("/");
  const event = JSON.parse(await readFile(eventPath, "utf8"));
  const run = event.workflow_run;
  if (!supportedTriggers.has(run?.name))
    throw new Error(`Unsupported merge trigger: ${run?.name ?? "missing"}`);
  if (!run?.head_sha) throw new Error("workflow_run head SHA is missing");
  const sha = run.head_sha;
  const config = JSON.parse(
    await readFile(".github/governance/required-checks.json", "utf8"),
  );
  let pulls = run.pull_requests ?? [];
  if (pulls.length === 0)
    pulls = await pages(
      token,
      `/repos/${owner}/${repo}/commits/${sha}/pulls?per_page=100`,
    );

  for (const item of pulls) {
    const number = item.number;
    let pull = await api(token, `/repos/${owner}/${repo}/pulls/${number}`);
    if (
      pull.base.ref !== config.baseBranch ||
      pull.head.sha !== sha ||
      pull.head.repo.ful_name !== repository
    )
      continue;
    if (pull.merged) {
      await ensureMainVerification(
        owner,
        repo,
        config,
        pull.merge_commit_sha,
        number,
        sha,
        token,
      );
      continue;
    }
    if (pull.state !== "open" || (config.blockDrafts && pull.draft)) continue;

    const mainRef = await api(
      token,
      `/repos/${owner}/${repo}/git/ref/heads/${config.baseBranch}`,
    );
    const comparison = await api(
      token,
      `/repos/${owner}/${repo}/compare/${mainRef.object.sha}...${sha}`,
    );
    if (comparison.behind_by > 0) continue;
    const checkState = await waitChecks(
      token,
      owner,
      repo,
      sha,
      config.requiredChecks,
    );
    if (!checkState.ready) continue;

    pull = await api(token, `/repos/${owner}/${repo}/pulls/${number}`);
    if (pull.state !== "open" || pull.draft || pull.head.sha !== sha) continue;
    const refreshedMain = await api(
      token,
      `/repos/${owner}/${repo}/git/ref/heads/${config.baseBranch}`,
    );
    const refreshed = await api(
      token,
      `/repos/${owner}/${repo}/compare/${refreshedMain.object.sha}...${sha}`,
    );
    if (
      refreshed.behind_by > 0 ||
      (await blockedByReview(token, owner, repo, number, config))
    )
      continue;

    const merged = await api(
      token,
      `/repos/${owner}/${repo}/pulls/${number}/merge`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sha,
          merge_method: config.mergeMethod,
          commit_title: `${pull.title} (#${number})`,
        }),
      },
    );
    if (!merged.merged)
      throw new Error(
        `GitHub refused to merge #${number}: ${merged.message}`,
      );
    await ensureMainVerification(
      owner,
      repo,
      config,
      merged.sha,
      number,
      sha,
      token,
    );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
