/**
 * QG-SECRET-BINDING-CONFIRM-CASCADE
 *
 * Issue Confirm Accept must pass cascade when the binding still depends on
 * a secret proposal. secretProposals.approve throws HTTP 409 for that case
 * unless cascade is set. A later package upgrade wipes a dist-only hotfix,
 * so this gate reads the source or the compiled route file and fails closed.
 */

const APPROVE_NEEDLE = "secretProposals.approve";
const WINDOW_CHARS = 800;

/**
 * @param {string} source
 * @returns {{ ok: boolean, reason: string }}
 */
export function checkConfirmAcceptCascade(source) {
  if (typeof source !== "string" || source.length === 0) {
    return { ok: false, reason: "source_empty" };
  }

  let index = 0;
  let sawApprove = false;
  while (index < source.length) {
    const at = source.indexOf(APPROVE_NEEDLE, index);
    if (at < 0) {
      break;
    }
    sawApprove = true;
    const window = source.slice(at, at + WINDOW_CHARS);
    const cascadeMatch = /cascade\s*:/.exec(window);
    const usesSecretProposalId = window.includes("secretProposalId");
    const forcedFalse = /cascade\s*:\s*false\b/.test(window);
    if (cascadeMatch && usesSecretProposalId && !forcedFalse) {
      return { ok: true, reason: "pass" };
    }
    index = at + APPROVE_NEEDLE.length;
  }

  if (!sawApprove) {
    return { ok: false, reason: "approve_call_absent" };
  }
  return { ok: false, reason: "cascade_absent" };
}

function printResult(result, label) {
  const status = result.ok ? "pass" : "fail";
  process.stdout.write(
    `QG-SECRET-BINDING-CONFIRM-CASCADE ${status} ${result.reason}${label ? ` ${label}` : ""}\n`,
  );
}

async function main() {
  const { readFileSync } = await import("node:fs");
  const args = process.argv.slice(2);
  if (args.includes("--self-test")) {
    const absent = checkConfirmAcceptCascade(`
      await secretProposals.approve(issue.companyId, proposal.id, {
        resolvedByUserId,
      });
    `);
    const forcedFalse = checkConfirmAcceptCascade(`
      await secretProposals.approve(issue.companyId, proposal.id, {
        resolvedByUserId,
        cascade: false,
        secretProposalId: proposal.secretProposalId,
      });
    `);
    const pass = checkConfirmAcceptCascade(`
      await secretProposals.approve(issue.companyId, proposal.id, {
        resolvedByUserId,
        cascade: typeof proposal.secretProposalId === "string" && proposal.secretProposalId.length > 0,
      });
    `);
    const failures = [];
    if (absent.ok || absent.reason !== "cascade_absent") {
      failures.push(`pre-fix fixture expected cascade_absent, got ${absent.reason}`);
    }
    if (forcedFalse.ok || forcedFalse.reason !== "cascade_absent") {
      failures.push(`cascade false fixture expected cascade_absent, got ${forcedFalse.reason}`);
    }
    if (!pass.ok) {
      failures.push(`cascade expression fixture expected pass, got ${pass.reason}`);
    }
    if (failures.length > 0) {
      for (const failure of failures) {
        process.stderr.write(`${failure}\n`);
      }
      process.exitCode = 1;
      return;
    }
    printResult({ ok: true, reason: "self_test_pass" });
    return;
  }

  const filePath = args.find((arg) => !arg.startsWith("--"));
  if (!filePath) {
    process.stderr.write("usage: qg-secret-binding-confirm-cascade.mjs <issues.js|issues.ts> | --self-test\n");
    process.exitCode = 2;
    return;
  }
  const source = readFileSync(filePath, "utf8");
  const result = checkConfirmAcceptCascade(source);
  printResult(result, filePath);
  if (!result.ok) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && process.argv[1].endsWith("qg-secret-binding-confirm-cascade.mjs")) {
  main();
}
