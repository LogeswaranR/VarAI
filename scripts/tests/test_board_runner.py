"""Temporary-worktree and OS-policy checks, never evidence of a live model."""

import importlib.util
import json
import os
from pathlib import Path
import select
import signal
import subprocess
import sys
import unittest
from unittest.mock import patch

import test_board_dispatch as fixtures

run_git = fixtures.run_git


SCRIPTS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))
SPEC = importlib.util.spec_from_file_location("board_runner", SCRIPTS / "board_runner.py")
runner = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(runner)


class RunnerTests(unittest.TestCase):
    control = fixtures.DispatchTests.control
    lane = fixtures.DispatchTests.lane
    enable = fixtures.DispatchTests.enable

    def setUp(self):
        fixtures.DispatchTests.setUp(self)
        rows = [
            f"| {card} | " + ", ".join(f"`{path}/**`" for path in paths) + " |"
            for card, paths in runner.OWNERSHIP.items()
        ]
        (self.root / "docs/backlog/contract-v0.2.md").write_text("\n".join(rows), encoding="utf-8")
        for name in runner.SKILLS:
            target = self.root / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text("Fixture skill; no live worker evidence.\n", encoding="utf-8")
        for name, suffix in (("README.md", ""), ("technical-tasks.md", "-T01")):
            text = "\n".join(f"### {card}{suffix}: Fixture\n\n"
                             f"- [ ] [{card}{suffix}-AC1] Check fixture behavior.\n"
                             for card in runner.OWNERSHIP)
            (self.root / "docs/backlog" / name).write_text(text, encoding="utf-8")
        run_git(self.root, "add", ".")
        run_git(self.root, "commit", "-m", "Extend isolated runner fixture")
        self.baseline = run_git(self.root, "rev-parse", "HEAD")
        self.local = runner.Runner(self.root)
        guidance = patch.object(self.local, "guidance", side_effect=lambda reference: {
            **reference, "status": "fixture", "content": "Synthetic guidance; no network or model.",
        })
        guidance.start()
        self.addCleanup(guidance.stop)
        self.enable()

    def reserve(self, card="VAR-101"):
        self.lane(card, "Development")
        return self.local.reserve(card, "development", "fixture-run")

    def ready(self, record, attach=True):
        token = record["claim"]
        record["phase"] = "launching"
        runner.save_json(self.local.record_path(token), record)
        identity = "fixture-worker-" + token
        self.local.record_event(token, {"operation": "identity", "agentId": identity})
        if attach:
            self.local.record_event(token, {
                "operation": "attach", "agentId": identity,
                "model": record["model"], "workspace": record["workspace"],
            })
        return identity

    def test_paused_scan_never_probes_or_claims(self):
        self.control("Dispatch", "Paused")
        self.lane("VAR-101", "Development")
        with patch.object(self.local, "preflight") as probe:
            with self.assertRaises(runner.BoardError):
                self.local.prepare("VAR-101", "development", "fixture-run")
        probe.assert_not_called()
        self.assertEqual(self.dispatcher.scan()["claims"], {})

    def test_model_gate_precedes_claim_and_worktree(self):
        self.lane("VAR-101", "Development")
        with patch.object(self.local, "preflight", return_value={
            "modelSelectionPassed": False, "process": {"exitCode": 2},
        }):
            with self.assertRaisesRegex(runner.BoardError, "no claim or worker"):
                self.local.prepare("VAR-101", "development", "fixture-run")
        self.assertEqual(self.dispatcher.scan()["claims"], {})
        self.assertFalse((self.root.parent / "repo.varai-worktrees").exists())

    def test_runtime_preserves_auth_profile_path_but_not_unapproved_environment(self):
        profile = str(Path(self.temporary.name) / "synthetic-auth-profile")
        with patch.dict(os.environ, {"COPILOT_HOME": profile, "VARAI_TEST_PARENT_ONLY": "synthetic"}), \
                patch.object(runner.subprocess, "Popen") as spawn, \
                patch.object(runner, "finish_group", return_value=[]):
            spawn.return_value.pid = 123
            spawn.return_value.poll.return_value = 0
            spawn.return_value.returncode = 0
            self.local.bridge("preflight", {}, self.evidence_dir / "fixture-probe.log")
            environment = spawn.call_args.kwargs["env"]
        self.assertEqual(environment["COPILOT_HOME"], profile)
        self.assertEqual(environment["COPILOT_AUTO_UPDATE"], "false")
        self.assertNotIn("VARAI_TEST_PARENT_ONLY", environment)
        self.assertNotIn("GITHUB_TOKEN", environment)
        self.assertNotIn("GH_TOKEN", environment)

    def test_distinct_baseline_worktrees_without_copying_dirty_canonical_source(self):
        (self.root / "source.txt").write_text("Canonical uncommitted work\n", encoding="utf-8")
        first, second = self.reserve(), self.reserve("VAR-102")
        self.assertNotEqual(first["workspace"], second["workspace"])
        for record in (first, second):
            tree = Path(record["workspace"])
            self.assertEqual(run_git(tree, "rev-parse", "HEAD"), self.baseline)
            self.assertEqual((tree / "source.txt").read_text(), "baseline\n")
            self.assertTrue((tree / ".git").is_file())
        self.assertEqual(self.dispatcher.scan()["availableSlots"]["development"], 0)
        self.lane("VAR-105", "Development")
        with self.assertRaises(runner.BoardError):
            self.local.reserve("VAR-105", "development", "third-fixture")

    def test_ownership_contract_drift_is_rejected_before_claim(self):
        self.lane("VAR-101", "Development")
        contract = self.root / "docs/backlog/contract-v0.2.md"
        contract.write_text(contract.read_text().replace("server/Scenarios", "server/Other"), encoding="utf-8")
        with self.assertRaisesRegex(runner.BoardError, "Ownership mapping changed"):
            self.local.reserve("VAR-101", "development", "fixture")
        self.assertEqual(self.dispatcher.scan()["claims"], {})

    def test_prepared_state_cannot_invoke_worker_tools(self):
        record = self.reserve()
        with self.assertRaises(runner.BoardError):
            self.local.tool(record["claim"], None, "varai_read", {"path": "source.txt"})

    def test_readiness_allows_reads_but_not_writes_or_checks(self):
        record = self.reserve()
        identity = self.ready(record, attach=False)
        self.assertEqual(self.local.tool(record["claim"], identity, "varai_read",
                                         {"path": "source.txt"})["content"], "baseline")
        for name, arguments in (
            ("varai_write", {"path": "server/Scenarios/new.cs", "content": "not allowed"}),
            ("varai_check", {"name": "package"}),
        ):
            with self.subTest(tool=name), self.assertRaisesRegex(runner.BoardError, "attached developer"):
                self.local.tool(record["claim"], identity, name, arguments)
        self.assertIsNone(self.dispatcher.inspect(record["claim"])["agentId"])

    def test_mismatched_actual_model_or_worktree_keeps_claim_reserved(self):
        record = self.reserve()
        identity = self.ready(record, attach=False)
        for model, workspace in (("auto", record["workspace"]), (record["model"], str(self.root))):
            with self.subTest(model=model, workspace=workspace), self.assertRaises(runner.BoardError):
                self.local.record_event(record["claim"], {
                    "operation": "attach", "agentId": identity, "model": model, "workspace": workspace,
                })
        self.assertIsNone(self.dispatcher.inspect(record["claim"])["agentId"])

    def test_readiness_changes_are_rejected(self):
        record = self.reserve()
        identity = self.ready(record, attach=False)
        (Path(record["workspace"]) / "source.txt").write_text("unexpected change\n", encoding="utf-8")
        with self.assertRaisesRegex(runner.BoardError, "Readiness must not change"):
            self.local.record_event(record["claim"], {
                "operation": "attach", "agentId": identity,
                "model": record["model"], "workspace": record["workspace"],
            })

    def test_attached_developer_can_write_and_read_only_owned_source(self):
        record = self.reserve()
        identity = self.ready(record)
        written = self.local.tool(record["claim"], identity, "varai_write",
                                  {"path": "server/Scenarios/new.cs", "content": "fixture source\n"})
        self.assertEqual(written["bytes"], len("fixture source\n"))
        result = self.local.tool(record["claim"], identity, "varai_read", {"path": written["written"]})
        self.assertEqual(result["content"], "fixture source")
        self.assertFalse((self.root / "server/Scenarios/new.cs").exists())
        self.local.tool(record["claim"], identity, "varai_remove", {"path": written["written"]})
        self.assertFalse((Path(record["workspace"]) / written["written"]).exists())
        for path in ("source.txt", "server/Scenarios"):
            with self.subTest(remove=path), self.assertRaises(runner.BoardError):
                self.local.tool(record["claim"], identity, "varai_remove", {"path": path})

    def test_traversal_canonical_other_card_and_metadata_writes_fail(self):
        record, other = self.reserve(), self.reserve("VAR-102")
        identity = self.ready(record)
        paths = [
            str(self.root / "source.txt"), str(Path(other["workspace"]) / "source.txt"),
            "../source.txt", "server/Scenarios/../../source.txt", ".git/config",
            "client/src/review-room/other.ts", "server/Scenarios/.env",
            "server/Scenarios/node_modules/escape.js", "server//Scenarios/bad.cs",
            "server/Scenarios/.gitignore", "server/Scenarios/ignored-output/invisible.cs",
        ]
        for path in paths:
            with self.subTest(path=path), self.assertRaises(runner.BoardError):
                self.local.tool(record["claim"], identity, "varai_write", {"path": path, "content": "denied"})
        self.assertEqual((self.root / "source.txt").read_text(), "baseline\n")

    def test_symlinks_and_hardlinks_cannot_escape(self):
        record = self.reserve()
        identity = self.ready(record)
        owned = Path(record["workspace"]) / "server/Scenarios"
        owned.mkdir(parents=True)
        (owned / "parent").symlink_to(self.root, target_is_directory=True)
        (owned / "leaf.cs").symlink_to(self.root / "source.txt")
        os.link(self.root / "source.txt", owned / "hard.cs")
        for path in ("parent/source.txt", "leaf.cs", "hard.cs"):
            with self.subTest(path=path), self.assertRaises((runner.BoardError, OSError)):
                self.local.tool(record["claim"], identity, "varai_write",
                                {"path": "server/Scenarios/" + path, "content": "denied"})
        self.assertEqual((self.root / "source.txt").read_text(), "baseline\n")

    def test_ignored_files_and_credentials_cannot_be_read(self):
        record = self.reserve()
        identity = self.ready(record)
        tree = Path(record["workspace"])
        (tree / "ignored-output").mkdir()
        (tree / "ignored-output/canary.txt").write_text("synthetic canary", encoding="utf-8")
        (tree / ".env").write_text("synthetic canary", encoding="utf-8")
        for path in ("ignored-output/canary.txt", ".env", ".git", str(self.root / "source.txt")):
            with self.subTest(path=path), self.assertRaises(runner.BoardError):
                self.local.tool(record["claim"], identity, "varai_read", {"path": path})
        for prefix in ("../", "/", ".git/", ".env"):
            with self.subTest(prefix=prefix), self.assertRaises(runner.BoardError):
                self.local.tool(record["claim"], identity, "varai_list", {"prefix": prefix})

    def test_qa_write_and_check_callbacks_are_denied_even_if_called_directly(self):
        record = self.reserve()
        self.ready(record)
        token = record["claim"]
        info = self.dispatcher.inspect(token)
        evidence = {key: info[key] for key in
                    ("claim", "agentId", "card", "role", "model", "baseline", "workspace", "fingerprint")}
        evidence.update(schemaVersion=1, verdict="pass", summary="Synthetic development fixture only.",
                        checks=[{"command": "fixture", "exitCode": 0, "evidence": "fixture://check"}],
                        findings=[], criteria=[{"id": criterion, "result": "passed", "evidence": "fixture://criterion"}
                                               for criterion in info["criteria"]])
        path = self.evidence_dir / "synthetic-development.json"
        runner.save_json(path, evidence)
        self.dispatcher.complete(token, str(path), True, "fixture://no-real-worker")
        qa = self.local.reserve("VAR-101", "qa", "fixture-qa")
        identity = self.ready(qa)
        self.assertEqual(qa["workspace"], record["workspace"])
        for name, arguments in (
            ("varai_write", {"path": "server/Scenarios/new.cs", "content": "denied"}),
            ("varai_check", {"name": "package"}),
        ):
            with self.subTest(tool=name), self.assertRaises(runner.BoardError):
                self.local.tool(qa["claim"], identity, name, arguments)

    def test_unknown_worker_and_stale_claim_cannot_write(self):
        record = self.reserve()
        identity = self.ready(record)
        with self.assertRaises(runner.BoardError):
            self.local.tool(record["claim"], "wrong-worker", "varai_list", {})
        self.dispatcher.block(record["claim"], "Synthetic fixture end", True, "fixture://stopped")
        with self.assertRaises(runner.BoardError):
            self.local.tool(record["claim"], identity, "varai_write",
                            {"path": "server/Scenarios/new.cs", "content": "denied"})

    def test_closed_dispatch_and_changed_policy_stop_writes_without_releasing_claim(self):
        record = self.reserve()
        identity = self.ready(record)
        self.control("Dispatch", "Paused")
        with self.assertRaisesRegex(runner.BoardError, "Dispatch gates closed"):
            self.local.tool(record["claim"], identity, "varai_write",
                            {"path": "server/Scenarios/new.cs", "content": "denied"})
        self.control("Dispatch", "Enabled")
        with patch.object(self.local, "policy_fingerprint", return_value="changed"):
            with self.assertRaisesRegex(runner.BoardError, "Runner policy changed"):
                self.local.tool(record["claim"], identity, "varai_write",
                                {"path": "server/Scenarios/new.cs", "content": "denied"})
        self.assertIn(record["claim"], self.dispatcher.scan()["claims"])

    def test_runtime_metadata_cannot_override_canonical_identity_or_workspace(self):
        record = self.reserve()
        identity = self.ready(record)
        path = self.local.record_path(record["claim"])
        original = runner.read_json(path)
        for field, value in (("role", "qa"), ("card", "VAR-102"), ("model", "auto"),
                             ("workspace", str(self.root)), ("agentId", "other-worker")):
            with self.subTest(field=field):
                runner.save_json(path, {**original, field: value})
                with self.assertRaises(runner.BoardError):
                    self.local.tool(record["claim"], identity, "varai_write",
                                    {"path": "server/Scenarios/new.cs", "content": "denied"})
        runner.save_json(path, original)
        self.assertIn(record["claim"], self.dispatcher.scan()["claims"])

    def test_coordinator_cannot_check_a_live_writer(self):
        record = self.reserve()
        self.ready(record)
        with patch.object(self.local, "run_check") as check:
            with self.assertRaises(runner.BoardError):
                self.local.coordinator_check(record["claim"], "package")
        check.assert_not_called()

    def test_unrecorded_reserved_claim_is_not_relaunched(self):
        self.lane("VAR-101", "Development")
        claim = self.dispatcher.claim("development", "VAR-101", "unknown-fixture")
        self.assertEqual(self.local.status(claim["claim"])["state"], "unknown")
        with self.assertRaises(runner.BoardError), patch.object(self.local, "preflight") as probe:
            self.local.start(claim["claim"])
        probe.assert_not_called()
        self.assertIn(claim["claim"], self.dispatcher.scan()["claims"])

    def test_worker_success_is_not_an_automatic_board_transition(self):
        record = self.reserve()
        self.ready(record)
        self.local.record_event(record["claim"], {"operation": "finished",
                                "agentId": "fixture-worker-" + record["claim"],
                                "content": "A model claims everything passed; this is not verified evidence."})
        self.assertEqual(self.dispatcher.inspect(record["claim"])["phase"], "running")
        result = runner.read_json(self.local.record_path(record["claim"]))
        self.assertEqual(result["phase"], "finished")
        self.assertFalse(runner.read_json(Path(result["resultPath"]))["verified"])
        with self.assertRaises(runner.BoardError):
            self.local.tool(record["claim"], result["agentId"], "varai_list", {})

    def test_ambiguous_launch_keeps_capacity_and_cannot_be_retried(self):
        record = self.reserve()
        with patch.object(self.local, "preflight", return_value={
            "modelSelectionPassed": True, "process": {"exitCode": 0},
        }), patch.object(self.local, "host", return_value={}), patch.object(self.local, "bridge", return_value={
            "exitCode": 1, "processGroup": 123, "remainingProcesses": [], "log": "fixture://launch",
        }) as bridge:
            result = self.local.start(record["claim"])
        self.assertEqual(bridge.call_count, 1)
        self.assertEqual(result["phase"], "needs_reconciliation")
        with self.assertRaises(runner.BoardError), patch.object(self.local, "preflight") as probe:
            self.local.start(record["claim"])
        probe.assert_not_called()
        self.assertIn(record["claim"], self.dispatcher.scan()["claims"])
        self.assertEqual(self.dispatcher.scan()["availableSlots"]["development"], 1)

    def test_successful_runtime_still_waits_for_coordinator_verification(self):
        record = self.reserve()

        def synthetic_bridge(operation, payload, log):
            self.assertEqual(operation, "worker")
            identity = "fixture-sdk-session"
            self.local.record_event(record["claim"], {"operation": "identity", "agentId": identity})
            self.local.record_event(record["claim"], {
                "operation": "attach", "agentId": identity,
                "model": record["model"], "workspace": record["workspace"],
            })
            self.local.record_event(record["claim"], {
                "operation": "finished", "agentId": identity, "content": "Synthetic model result; unverified.",
            })
            self.local.record_event(record["claim"], {"operation": "sdk-stopped", "confirmed": True})
            return {"exitCode": 0, "processGroup": 123, "remainingProcesses": [], "log": "fixture://runtime"}

        with patch.object(self.local, "preflight", return_value={
            "modelSelectionPassed": True, "process": {"exitCode": 0},
        }), patch.object(self.local, "host", return_value={}), patch.object(
            self.local, "bridge", side_effect=synthetic_bridge,
        ):
            result = self.local.start(record["claim"])
        self.assertEqual(result["phase"], "awaiting_coordinator_verification")
        self.assertIn(record["claim"], self.dispatcher.scan()["claims"])
        self.assertEqual(self.dispatcher.scan()["eligible"]["qa"], [])
        stop = runner.read_json(Path(result["stopEvidence"]))
        self.assertTrue(stop["workerStopped"])
        self.assertEqual(stop["fingerprint"], self.dispatcher.inspect(record["claim"])["fingerprint"])

    def test_check_names_do_not_accept_shell_fragments(self):
        record = self.reserve()
        identity = self.ready(record)
        for arguments in ({"name": "package; echo bad"}, {"name": "package", "command": "echo bad"}):
            with self.subTest(arguments=arguments), self.assertRaises(runner.BoardError):
                self.local.tool(record["claim"], identity, "varai_check", arguments)
        self.assertEqual(self.local.check_commands(record)["owned"][0], "dotnet")

    def test_assignment_includes_all_criteria_skills_and_pinned_reference(self):
        record = self.reserve()
        assignment = self.local.assignment(record)
        self.assertEqual(set(assignment["identity"]["criteria"]), {"VAR-101-AC1", "VAR-101-T01-AC1"})
        for name in runner.SKILLS:
            self.assertIn(name, assignment["localInstructionsAndSkills"])
        self.assertEqual(assignment["selectedReferences"][0]["revision"], runner.REFERENCE_REVISION)
        self.assertEqual(assignment["canonicalBoard"], str(self.root.resolve() / "docs/backlog/board.md"))

    def test_oversized_evidence_is_rejected_without_a_partial_file(self):
        path = self.evidence_dir / "too-large.json"
        with self.assertRaisesRegex(runner.BoardError, "64 KiB"):
            runner.save_json(path, {"content": "x" * (64 * 1024)})
        self.assertFalse(path.exists())

    @unittest.skipUnless(sys.platform == "darwin", "macOS registered-check integration")
    def test_registered_check_runs_in_sandbox_and_binds_real_result(self):
        (self.root / ".tools").symlink_to(SCRIPTS.parent / ".tools", target_is_directory=True)
        (self.root / "package.json").write_text(json.dumps({
            "scripts": {"test:package:102": "node check.mjs"},
        }), encoding="utf-8")
        (self.root / ".gitignore").write_text(
            "ignored-output/\n.tools/\n**/node_modules/\nclient/test-results/\n", encoding="utf-8")
        (self.root / "check.mjs").write_text(
            "import assert from 'node:assert/strict'\n"
            "import fs from 'node:fs'\n"
            "assert.equal(process.env.VARAI_TEST_PARENT_ONLY, undefined)\n"
            "const denied = error => ['EPERM', 'EACCES'].includes(error.code)\n"
            "assert.throws(() => fs.writeFileSync('source.txt', 'denied'), denied)\n"
            f"assert.throws(() => fs.readFileSync({json.dumps(str(self.root / 'source.txt'))}), denied)\n"
            "fs.writeFileSync('node_modules/.vite/fixture.txt', 'permitted')\n"
            "console.log('Controlled fixture check passed; not an application check.')\n",
            encoding="utf-8",
        )
        run_git(self.root, "add", "package.json", "check.mjs", ".gitignore")
        run_git(self.root, "commit", "-m", "Add isolated check fixture")
        self.baseline = run_git(self.root, "rev-parse", "HEAD")
        self.control("Approved baseline", self.baseline)
        record = self.reserve("VAR-102")
        identity = self.ready(record)
        with patch.dict(os.environ, {"VARAI_TEST_PARENT_ONLY": "synthetic-non-secret-canary"}), \
                patch.object(runner, "CHECK_TIMEOUT_SECONDS", 20):
            result = self.local.tool(record["claim"], identity, "varai_check", {"name": "package"})
        self.assertEqual(result["exitCode"], 0, result["output"])
        self.assertEqual(result["resultType"], "success", result["output"])
        self.assertIn("Controlled fixture check passed", result["output"])
        self.assertEqual(result["fingerprint"], self.dispatcher.inspect(record["claim"])["fingerprint"])
        self.assertEqual((self.root / "source.txt").read_text(), "baseline\n")
        self.assertEqual((Path(record["workspace"]) / "source.txt").read_text(), "baseline\n")
        current = runner.read_json(self.local.record_path(record["claim"]))
        self.assertEqual(current["activeCheckGroups"], [])
        self.assertEqual(len(current["checks"]), 1)
        self.assertEqual(current["checks"][0]["remainingOpenHandles"], [])

    @unittest.skipUnless(sys.platform == "darwin", "macOS residual-process inspection")
    def test_open_handle_audit_detects_but_does_not_kill_an_unowned_reader(self):
        record = self.reserve()
        source = Path(record["workspace"]) / "source.txt"
        process = subprocess.Popen(
            [sys.executable, "-B", "-c",
             "import sys,time; handle=open(sys.argv[1]); print('ready',flush=True); time.sleep(30)", str(source)],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, start_new_session=True,
        )
        try:
            self.assertTrue(select.select([process.stdout], [], [], 5)[0], "Fixture reader did not become ready.")
            self.assertEqual(process.stdout.readline().strip(), "ready")
            self.assertIn(process.pid, runner.open_handle_pids([record["workspace"]]))
            self.assertIsNone(process.poll(), "Inspection must not kill a process with uncertain ownership.")
        finally:
            process.terminate()
            process.communicate(timeout=5)

    @unittest.skipUnless(sys.platform == "darwin" and Path("/usr/bin/sandbox-exec").is_file(),
                         "macOS OS-enforced check policy test")
    def test_real_os_policy_denies_source_cross_tree_and_outside_reads(self):
        record, other = self.reserve(), self.reserve("VAR-102")
        workspace = Path(record["workspace"])
        scratch = Path(self.temporary.name) / "check-scratch"
        scratch.mkdir()
        output = workspace / "ignored-output"
        output.mkdir()
        policy = scratch / "check.sb"
        toolchain = SCRIPTS.parent / ".tools"
        policy.write_text(runner.check_profile(workspace, toolchain, scratch, [output],
                                              scratch / "packages"), encoding="utf-8")

        def execute(script, target):
            return subprocess.run(
                ["/usr/bin/sandbox-exec", "-f", str(policy), "/bin/sh", "-c", script, "probe", str(target)],
                cwd=workspace, env={"PATH": "/usr/bin:/bin", "HOME": str(scratch), "TMPDIR": str(scratch)},
                capture_output=True, text=True, timeout=15,
            )

        positive = execute('printf permitted > "$1"', output / "allowed.txt")
        self.assertEqual(positive.returncode, 0, positive.stderr)
        self.assertEqual((output / "allowed.txt").read_text(), "permitted")
        self.assertEqual(execute('cat "$1"', workspace / "source.txt").returncode, 0)
        for target in (workspace / "source.txt", self.root / "source.txt",
                       Path(other["workspace"]) / "source.txt"):
            with self.subTest(target=target):
                result = execute('printf denied > "$1"', target)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(target.read_text(), "baseline\n")
        denied_read = execute('cat "$1"', self.root / "source.txt")
        self.assertNotEqual(denied_read.returncode, 0)
        self.assertNotIn("baseline", denied_read.stdout)
        for executable, expected in (
            (toolchain / "node/bin/node", "v" + (SCRIPTS.parent / ".node-version").read_text().strip()),
            (toolchain / "dotnet/dotnet", json.loads((SCRIPTS.parent / "global.json").read_text())["sdk"]["version"]),
        ):
            with self.subTest(executable=executable):
                process = subprocess.Popen(
                    ["/usr/bin/sandbox-exec", "-f", str(policy), str(executable), "--version"],
                    cwd=workspace, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                    start_new_session=True,
                    env={"PATH": "/usr/bin:/bin", "HOME": str(scratch), "TMPDIR": str(scratch),
                         "DOTNET_ROOT": str(toolchain / "dotnet"), "DOTNET_CLI_HOME": str(scratch),
                         "DOTNET_CLI_TELEMETRY_OPTOUT": "1", "DOTNET_SKIP_FIRST_TIME_EXPERIENCE": "1",
                         "DOTNET_NOLOGO": "1"},
                )
                try:
                    stdout, stderr = process.communicate(timeout=20)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
                    stdout, stderr = process.communicate()
                    self.fail(f"Sandboxed {executable.name} timed out; owned PID {process.pid}; {stderr}")
                self.assertEqual(process.returncode, 0, stderr)
                self.assertIn(expected, stdout.splitlines())


if __name__ == "__main__":
    unittest.main()
