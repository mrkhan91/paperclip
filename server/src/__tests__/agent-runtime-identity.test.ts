import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import {
  buildAgentRuntimeIdentity,
  type AgentRuntimeIdentity,
} from "../agent-runtime-identity.js";

const testServerInfo = {
  processStartedAt: "2026-09-24T01:54:04.636Z",
  git: {
    available: true as const,
    fullSha: "0123456789abcdef0123456789abcdef01234567",
    shortSha: "0123456",
    branchName: "master",
    subject: "test commit",
    committedAt: "2026-09-23T12:00:00.000Z",
    localChanges: {
      available: true as const,
      hasLocalChanges: false,
      stagedFileCount: 0,
      unstagedFileCount: 0,
      untrackedFileCount: 0,
    },
  },
};

const unavailableServerInfo = {
  processStartedAt: "2026-09-24T01:54:04.636Z",
  git: {
    available: false as const,
    unavailableReason: "git_unavailable" as const,
  },
};

describe("buildAgentRuntimeIdentity", () => {
  it("returns non-secret CalVer + process identity from shared version sources", () => {
    const identity = buildAgentRuntimeIdentity({
      serverInfo: testServerInfo,
      version: "2026.916.0",
      deploymentMode: "authenticated",
      deploymentExposure: "public",
    });

    expect(identity).toEqual<AgentRuntimeIdentity>({
      version: "2026.916.0",
      serverVersion: "2026.916.0",
      commit: "0123456789abcdef0123456789abcdef01234567",
      processStartedAt: "2026-09-24T01:54:04.636Z",
      deploymentMode: "authenticated",
      deploymentExposure: "public",
      git: {
        available: true,
        shortSha: "0123456",
        branchName: "master",
        committedAt: "2026-09-23T12:00:00.000Z",
      },
    });
  });

  it("omits git SHAs when git metadata is unavailable", () => {
    const identity = buildAgentRuntimeIdentity({
      serverInfo: unavailableServerInfo,
      version: "2026.916.0",
    });

    expect(identity.commit).toBeNull();
    expect(identity.git).toEqual({
      available: false,
      shortSha: null,
      branchName: null,
      committedAt: null,
      unavailableReason: "git_unavailable",
    });
  });

  it("never includes secret-like or board-privileged keys", () => {
    const identity = buildAgentRuntimeIdentity({
      serverInfo: testServerInfo,
      version: "2026.916.0",
    });
    const keys = Object.keys(identity);
    expect(keys).not.toContain("databaseBackup");
    expect(keys).not.toContain("backupDir");
    expect(keys).not.toContain("features");
    expect(JSON.stringify(identity)).not.toMatch(/secret|password|token|apiKey/i);
  });
});

describe("GET /agents/me/runtime auth contract", () => {
  function createApp(actor: { type: string; agentId?: string } | null) {
    const app = express();
    app.use((req, _res, next) => {
      (req as express.Request & { actor?: unknown }).actor = actor ?? {
        type: "none",
        source: "none",
      };
      next();
    });
    app.get("/agents/me/runtime", (req, res) => {
      const typed = req as express.Request & {
        actor?: { type?: string; agentId?: string };
      };
      if (typed.actor?.type !== "agent" || !typed.actor.agentId) {
        res.status(401).json({ error: "Agent authentication required" });
        return;
      }
      res.setHeader("Cache-Control", "no-store");
      res.json(
        buildAgentRuntimeIdentity({
          serverInfo: unavailableServerInfo,
          version: "2026.916.0",
          deploymentMode: "authenticated",
        }),
      );
    });
    return app;
  }

  it("returns identity for an authenticated agent", async () => {
    const res = await request(createApp({ type: "agent", agentId: "agent-1" })).get(
      "/agents/me/runtime",
    );
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body.version).toBe("2026.916.0");
    expect(res.body.serverVersion).toBe("2026.916.0");
    expect(res.body.processStartedAt).toBe("2026-09-24T01:54:04.636Z");
  });

  it("rejects unauthenticated callers", async () => {
    const res = await request(createApp(null)).get("/agents/me/runtime");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Agent authentication required" });
  });

  it("rejects board actors (agent-only surface)", async () => {
    const res = await request(createApp({ type: "board" })).get("/agents/me/runtime");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Agent authentication required" });
  });
});
