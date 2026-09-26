import type { ServerInfoSnapshot } from "@paperclipai/shared";
import { getServerInfoSnapshot } from "./server-info.js";
import { serverVersion } from "./version.js";

/**
 * Non-secret deploy/runtime identity for agent incident reports.
 *
 * Reuses the same `serverVersion` + `getServerInfoSnapshot()` sources as
 * `/api/health` so agents do not need a parallel versioning system. Omits
 * board-privileged internals (backup paths, restart controls, DB status).
 */
export type AgentRuntimeIdentity = {
  version: string;
  serverVersion: string;
  commit: string | null;
  processStartedAt: string;
  deploymentMode: string | null;
  deploymentExposure: string | null;
  git: {
    available: boolean;
    shortSha: string | null;
    branchName: string | null;
    committedAt: string | null;
    unavailableReason?: string;
  };
};

export type AgentRuntimeIdentityOptions = {
  serverInfo?: ServerInfoSnapshot;
  deploymentMode?: string | null;
  deploymentExposure?: string | null;
  /** Override package CalVer — tests only. */
  version?: string;
};

export function buildAgentRuntimeIdentity(
  opts: AgentRuntimeIdentityOptions = {},
): AgentRuntimeIdentity {
  const serverInfo = opts.serverInfo ?? getServerInfoSnapshot();
  const version = opts.version ?? serverVersion;
  const commit = serverInfo.git.available ? serverInfo.git.fullSha : null;

  return {
    version,
    serverVersion: version,
    commit,
    processStartedAt: serverInfo.processStartedAt,
    deploymentMode: opts.deploymentMode ?? null,
    deploymentExposure: opts.deploymentExposure ?? null,
    git: serverInfo.git.available
      ? {
          available: true,
          shortSha: serverInfo.git.shortSha,
          branchName: serverInfo.git.branchName,
          committedAt: serverInfo.git.committedAt,
        }
      : {
          available: false,
          shortSha: null,
          branchName: null,
          committedAt: null,
          unavailableReason: serverInfo.git.unavailableReason,
        },
  };
}
