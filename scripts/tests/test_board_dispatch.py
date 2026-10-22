"""Lifecycle tests with temporary repositories; no real agents or cloud services."""

from concurrent.futures import ThreadPoolExecutor
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[1] / "board_dispatch.py"
SPEC = importlib.util.spec_from_file_location("board_dispatch", SCRIPT)
dispatch = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(dispatch)


def run_git(root, *args):
    return subprocess.run(
        ["git", "-C", str(root), *args], check=True, capture_output=True, text=True
    ).stdout.strip()


class DispatchTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="varai-dispatch-test-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name) / "repo"
        self.root.mkdir()
        run_git(self.root, "init", "--initial-branch=main")
        run_git(self.root, "config", "user.name", "Workflow fixture")
        run_git(self.root, "config", "user.email", "fixture@example.invalid")
        run_git(self.root, "config", "commit.gpgsign", "false")
        run_git(self.root, "config", "core.autocrlf", "false")
        self.board_path = self.root / "docs/backlog/board.md"
        self.board_path.parent.mkdir(parents=True)
        controls = "| Setting | Value |\n| --- | --- |\n" + "\n".join([
            "| Dispatch | Paused |", "| Active batch | 1 |",
            "| Approved baseline | Pending |", "| Batch 1 sign-off | Pending |",
        ])
        rows = ["| ID | Title | Kind | Status | Owner | Notes |", "| --- | --- | --- | --- | --- | --- |"]
        cards = ["VAR-E01", "VAR-G00", "VAR-G00-T01", "VAR-G00-T02", "VAR-G00-T03"]
        for card in dispatch.PACKAGES:
            cards.extend([card, card + "-T01"])
        cards.append("VAR-G01")
        for card in cards:
            kind = "Package" if card in dispatch.PACKAGES else "Task"
            rows.append(f"| {card} | Fixture | {kind} | To Do | Unassigned | - |")
        state = {"schemaVersion": 1, "claims": {}, "candidates": {}, "qaFailures": {},
                 "contextReplacements": {}, "history": []}
        self.board_path.write_text(
            controls + "\n\n" + "\n".join(rows) +
            "\n\n<!-- dispatch-state:start -->\n```json\n" + json.dumps(state, indent=2) +
            "\n```\n<!-- dispatch-state:end -->\n", encoding="utf-8"
        )
        for path, content in {
            "docs/backlog/README.md": "\n".join(f"- [ ] [{card}-AC1] Check behavior." for card in dispatch.PACKAGES),
            "docs/backlog/technical-tasks.md": "\n".join(
                f"- [ ] [{card}-T01-AC1] Check technical behavior." for card in dispatch.PACKAGES),
            "docs/backlog/contract-v0.1.md": "Historical fixture contract, not the current contract\n",
            "docs/backlog/contract-v0.2.md": "Fixture GraphQL contract\n",
            ".github/copilot-instructions.md": "Fixture requirements\n",
            "scripts/board_dispatch.py": "Fixture baseline dispatcher marker\n",
            "package.json": '{"scripts": {}}\n',
            "VarAI.slnx": "<Solution />\n",
            ".gitignore": "ignored-output/\n",
            "source.txt": "baseline\n",
        }.items():
            target = self.root / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content, encoding="utf-8")
        run_git(self.root, "add", ".")
        run_git(self.root, "commit", "-m", "Isolated test baseline")
        self.baseline = run_git(self.root, "rev-parse", "HEAD")
        self.dispatcher = dispatch.Dispatcher(self.root)
        self.evidence_dir = self.root / ".git/varai-workflow/evidence"
        self.evidence_dir.mkdir(parents=True)
        self.counter = 0

    def control(self, name, value):
        text = self.board_path.read_text(encoding="utf-8")
        prefix = f"| {name} | "
        lines = [prefix + str(value) + " |" if line.startswith(prefix) else line for line in text.splitlines()]
        self.board_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    def lane(self, card, status):
        with self.dispatcher.locked_board() as board:
            board.update(card, status, "Unassigned", "Fixture")
            board.save()

    def enable(self):
        self.control("Dispatch", "Enabled")
        self.control("Approved baseline", self.baseline)
        for card in ("VAR-G00", "VAR-G00-T01", "VAR-G00-T02", "VAR-G00-T03"):
            self.lane(card, "Done")

    def worktree(self, card):
        path = Path(self.temporary.name) / card
        if not path.exists():
            run_git(self.root, "worktree", "add", "--detach", str(path), self.baseline)
        return path.resolve()

    def start(self, role, card, workspace=None):
        self.counter += 1
        claim = self.dispatcher.claim(role, card, f"run-{self.counter}")
        workspace = workspace or self.worktree(card)
        worker = f"worker-{self.counter}"
        self.dispatcher.attach(claim["claim"], worker, dispatch.MODELS[role], str(workspace))
        return claim["claim"]

    def record(self, token, verdict="pass"):
        info = self.dispatcher.inspect(token)
        report = {key: info[key] for key in
                  ("claim", "agentId", "card", "role", "model", "baseline", "workspace", "fingerprint")}
        report.update({
            "schemaVersion": 1, "summary": "Synthetic lifecycle evidence, not an actual application result.",
            "verdict": verdict, "checks": [
                {"command": "fixture-only-check", "exitCode": 0, "evidence": "fixture://check-result"}
            ],
            "findings": [],
            "criteria": [{"id": item, "result": "passed", "evidence": "fixture://criterion"}
                         for item in info["criteria"]],
        })
        if verdict == "changes_requested":
            report["findings"] = [{"blocking": True, "evidence": "fixture://missing-behavior"}]
        return report

    def save_record(self, record):
        self.counter += 1
        path = self.evidence_dir / f"record-{self.counter}.json"
        path.write_text(json.dumps(record, indent=2), encoding="utf-8")
        return path

    def finish(self, token, verdict="pass", report=None):
        return self.dispatcher.complete(
            token, str(self.save_record(report or self.record(token, verdict))),
            worker_stopped=True, stop_evidence="fixture://worker-ended-and-no-owned-processes"
        )

    def develop(self, card="VAR-101"):
        self.lane(card, "Development")
        token = self.start("development", card)
        self.finish(token)
        return self.worktree(card)

    def checkpoint_record(self, token):
        info = self.dispatcher.inspect(token)
        record = {key: info[key] for key in
                  ("claim", "agentId", "card", "role", "model", "baseline", "workspace", "fingerprint")}
        record.update({
            "schemaVersion": 1, "reason": "context_pressure", "signal": "Fixture runtime warning",
            "summary": "Partial work saved.", "nextStep": "Check the remaining fixture criterion.",
            "permissions": "Same role; no new privileges.", "changedFiles": [],
            "decisions": ["Retain the contract."], "checks": ["Fixture checks only."],
            "failedApproaches": [], "blockers": [],
            "sourceRefs": ["docs/backlog/board.md", "docs/backlog/README.md",
                           "docs/backlog/technical-tasks.md", "docs/backlog/contract-v0.2.md"],
            "pendingApprovals": ["Human batch sign-off"], "remainingCriteria": info["criteria"],
            "qaFailures": info["qaFailures"], "contextReplacements": info["contextReplacements"],
            "ownedProcesses": [],
        })
        return record

    def transfer(self, token, record=None):
        path = self.save_record(record or self.checkpoint_record(token))
        return self.dispatcher.checkpoint(
            token, str(path), worker_stopped=True, stop_evidence="fixture://old-worker-confirmed-ended"
        )

    def test_paused_scan_does_not_change_board_or_dispatch(self):
        self.lane("VAR-101", "Development")
        before = self.board_path.read_bytes()
        result = self.dispatcher.scan()
        self.assertEqual(result["eligible"], {"development": [], "qa": []})
        self.assertEqual(result["availableSlots"], {"development": 2, "qa": 2})
        self.assertEqual(before, self.board_path.read_bytes())
        with self.assertRaisesRegex(dispatch.BoardError, "paused"):
            self.dispatcher.claim("development", "VAR-101", "run")

    def test_t01_done_alone_cannot_open_g00(self):
        self.control("Dispatch", "Enabled")
        self.control("Approved baseline", self.baseline)
        self.lane("VAR-G00-T01", "Done")
        self.lane("VAR-101", "Development")
        with self.assertRaisesRegex(dispatch.BoardError, "not complete"):
            self.dispatcher.claim("development", "VAR-101", "run")

    def test_baseline_must_be_recorded_and_contain_required_files(self):
        self.enable()
        self.control("Approved baseline", "HEAD")
        self.assertTrue(any("baseline" in reason for reason in self.dispatcher.scan()["blockers"]))
        run_git(self.root, "rm", "docs/backlog/contract-v0.2.md")
        run_git(self.root, "commit", "-m", "Incomplete fixture baseline")
        self.control("Approved baseline", run_git(self.root, "rev-parse", "HEAD"))
        with self.assertRaisesRegex(dispatch.BoardError, "Git"):
            self.dispatcher.scan()

    def test_gate_and_task_cards_cannot_be_dispatched(self):
        self.enable()
        for card in ("VAR-G00", "VAR-G00-T02", "VAR-101-T01", "VAR-G01"):
            with self.subTest(card=card), self.assertRaises(dispatch.BoardError):
                self.dispatcher.claim("development", card, "run")

    def test_claims_are_durable_and_do_not_expire(self):
        self.enable()
        self.lane("VAR-101", "Development")
        token = self.dispatcher.claim("development", "VAR-101", "old-run")["claim"]
        with self.dispatcher.locked_board() as board:
            board.state["claims"][token]["startedAt"] = "2000-01-01T00:00:00+00:00"
            board.save()
        other = dispatch.Dispatcher(self.root)
        self.assertEqual(other.scan()["availableSlots"]["development"], 1)
        with self.assertRaisesRegex(dispatch.BoardError, "queue"):
            other.claim("development", "VAR-101", "new-run")

    def test_concurrent_processes_respect_two_development_slots(self):
        self.enable()
        for card in dispatch.BATCHES["1"]:
            self.lane(card, "Development")
        processes = [
            subprocess.Popen(
                [sys.executable, "-B", str(SCRIPT), "--repo", str(self.root), "claim",
                 "--role", "development", "--card", card, "--run-id", card],
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
            ) for card in dispatch.BATCHES["1"]
        ]
        outcomes = [process.communicate(timeout=20) for process in processes]
        self.assertEqual(sorted(process.returncode for process in processes), [0, 0, 2, 2])
        self.assertEqual(self.dispatcher.scan()["availableSlots"]["development"], 0)
        self.assertTrue(all("slot" in error for process, (_, error) in zip(processes, outcomes)
                            if process.returncode != 0))

    def test_simultaneous_duplicate_claim_has_one_winner(self):
        self.enable()
        self.lane("VAR-101", "Development")
        def attempt(index):
            try:
                return self.dispatcher.claim("development", "VAR-101", str(index))["claim"]
            except dispatch.BoardError:
                return None
        with ThreadPoolExecutor(max_workers=4) as executor:
            results = list(executor.map(attempt, range(4)))
        self.assertEqual(sum(result is not None for result in results), 1)

    def test_two_qa_slots_have_separate_capacity(self):
        self.enable()
        for card in dispatch.BATCHES["1"][:3]:
            self.develop(card)
        for card in dispatch.BATCHES["1"][:2]:
            self.start("qa", card)
        with self.assertRaisesRegex(dispatch.BoardError, "slot"):
            self.dispatcher.claim("qa", dispatch.BATCHES["1"][2], "another-run")
        self.assertEqual(self.dispatcher.scan()["availableSlots"], {"development": 2, "qa": 0})

    def test_exact_model_and_separate_worktree_are_required(self):
        self.enable()
        self.lane("VAR-101", "Development")
        token = self.dispatcher.claim("development", "VAR-101", "run")["claim"]
        with self.assertRaisesRegex(dispatch.BoardError, "model"):
            self.dispatcher.attach(token, "worker", "gpt-6.1-sol", str(self.worktree("VAR-101")))
        with self.assertRaisesRegex(dispatch.BoardError, "canonical"):
            self.dispatcher.attach(token, "worker", "gpt-6-astra", str(self.root))
        self.assertIsNone(self.dispatcher.scan()["claims"][token]["agentId"])

    def test_two_cards_cannot_share_worktree_or_worker(self):
        self.enable()
        self.lane("VAR-101", "Development")
        first = self.start("development", "VAR-101")
        self.lane("VAR-102", "Development")
        second = self.dispatcher.claim("development", "VAR-102", "run")["claim"]
        old = self.dispatcher.inspect(first)
        with self.assertRaisesRegex(dispatch.BoardError, "fresh worker"):
            self.dispatcher.attach(second, old["agentId"], "gpt-6-astra", str(self.worktree("VAR-102")))
        with self.assertRaisesRegex(dispatch.BoardError, "already claimed"):
            self.dispatcher.attach(second, "other-worker", "gpt-6-astra", old["workspace"])

    def test_automatic_handoffs_stop_at_ready_for_review(self):
        self.enable()
        self.develop()
        token = self.start("qa", "VAR-101")
        result = self.finish(token)
        self.assertEqual(result["status"], "Ready for Review")
        board = dispatch.Board(self.board_path)
        self.assertEqual(board.status("VAR-101-T01"), "To Do")
        self.assertFalse(board.state["claims"])
        self.assertEqual(len(board.state["history"]), 2)

    def test_completed_developer_cannot_review_the_same_candidate(self):
        self.enable()
        self.develop()
        board = dispatch.Board(self.board_path)
        candidate = board.state["candidates"]["VAR-101"]
        token = self.dispatcher.claim("qa", "VAR-101", "qa-run")["claim"]
        with self.assertRaisesRegex(dispatch.BoardError, "fresh worker"):
            self.dispatcher.attach(token, candidate["developerAgentId"], "gpt-6.1-sol", candidate["workspace"])

    def test_stop_evidence_is_required_before_releasing_a_claim(self):
        self.enable()
        self.lane("VAR-101", "Development")
        token = self.start("development", "VAR-101")
        report = str(self.save_record(self.record(token)))
        with self.assertRaisesRegex(dispatch.BoardError, "stopped"):
            self.dispatcher.complete(token, report)
        with self.assertRaises(dispatch.BoardError):
            self.dispatcher.block(token, "Unknown worker state.", False, "Unknown")
        self.assertIn(token, self.dispatcher.scan()["claims"])

    def test_pass_report_is_bound_to_claim_model_candidate_and_criteria(self):
        self.enable()
        self.lane("VAR-101", "Development")
        token = self.start("development", "VAR-101")
        changes = [("claim", "old-token"), ("model", "other-model"), ("fingerprint", "0" * 64),
                   ("criteria", []), ("checks", []), ("agentId", "old-worker"), ("verdict", []),
                   ("criteria", [{"id": [], "result": "passed", "evidence": "invalid"}])]
        for field, value in changes:
            with self.subTest(field=field):
                record = self.record(token)
                record[field] = value
                with self.assertRaises(dispatch.BoardError):
                    self.finish(token, report=record)
        self.assertIn(token, self.dispatcher.scan()["claims"])

    def test_changed_requirements_prevent_completion(self):
        self.enable()
        self.lane("VAR-101", "Development")
        token = self.start("development", "VAR-101")
        record = self.save_record(self.record(token))
        (self.root / "docs/backlog/contract-v0.2.md").write_text("Changed contract\n", encoding="utf-8")
        with self.assertRaisesRegex(dispatch.BoardError, "Requirements changed"):
            self.dispatcher.complete(token, str(record), True, "fixture://ended")

    def test_development_cannot_change_between_validation_and_save(self):
        self.enable()
        self.lane("VAR-101", "Development")
        token = self.start("development", "VAR-101")
        record = self.record(token)
        evidence = self.save_record(record)
        with patch.object(self.dispatcher, "snapshot", side_effect=[record["fingerprint"], "f" * 64]):
            with self.assertRaisesRegex(dispatch.BoardError, "while validating"):
                self.dispatcher.complete(token, str(evidence), True, "fixture://ended")
        self.assertIn(token, self.dispatcher.scan()["claims"])

    def test_stale_qa_candidate_is_rejected_before_and_after_attach(self):
        self.enable()
        path = self.develop()
        source = path / "source.txt"
        source.write_text("changed\n", encoding="utf-8")
        with self.assertRaisesRegex(dispatch.BoardError, "Candidate changed"):
            self.dispatcher.claim("qa", "VAR-101", "run")
        source.write_text("baseline\n", encoding="utf-8")
        token = self.start("qa", "VAR-101")
        source.write_text("changed during QA\n", encoding="utf-8")
        with self.assertRaisesRegex(dispatch.BoardError, "Candidate changed during QA"):
            self.finish(token)
        self.assertIn(token, self.dispatcher.scan()["claims"])

    def test_development_evidence_is_immutable(self):
        self.enable()
        self.develop()
        candidate = dispatch.Board(self.board_path).state["candidates"]["VAR-101"]
        (self.root / candidate["developmentEvidence"]).write_text("{}", encoding="utf-8")
        with self.assertRaisesRegex(dispatch.BoardError, "evidence changed"):
            self.dispatcher.claim("qa", "VAR-101", "run")

    def test_two_correction_rounds_then_block_survives_reloads(self):
        self.enable()
        self.develop()
        for expected in ("Development", "Development", "Blocked"):
            self.dispatcher = dispatch.Dispatcher(self.root)
            token = self.start("qa", "VAR-101")
            self.assertEqual(self.finish(token, "changes_requested")["status"], expected)
            if expected == "Development":
                self.finish(self.start("development", "VAR-101"))
        self.lane("VAR-101", "Development")
        with self.assertRaisesRegex(dispatch.BoardError, "correction limit"):
            self.dispatcher.claim("development", "VAR-101", "new-run")
        self.assertEqual(self.dispatcher.scan()["qaFailures"]["VAR-101"], 3)

    def test_checkpoint_rotates_token_without_releasing_role_capacity(self):
        self.enable()
        self.lane("VAR-101", "Development")
        old = self.start("development", "VAR-101")
        old_info = self.dispatcher.inspect(old)
        replacement = self.transfer(old)
        token = replacement["claim"]
        self.assertNotEqual(old, token)
        self.assertEqual(self.dispatcher.scan()["availableSlots"]["development"], 1)
        self.assertEqual(dispatch.Board(self.board_path).status("VAR-101"), "In Development")
        with self.assertRaisesRegex(dispatch.BoardError, "Unknown"):
            self.dispatcher.inspect(old)
        with self.assertRaisesRegex(dispatch.BoardError, "fresh worker"):
            self.dispatcher.attach(token, old_info["agentId"], "gpt-6-astra", replacement["workspace"])
        self.dispatcher = dispatch.Dispatcher(self.root)
        self.dispatcher.attach(token, "fresh-context", "gpt-6-astra", replacement["workspace"])
        self.assertEqual(self.dispatcher.inspect(token)["contextReplacements"], 1)
        self.assertEqual(self.finish(token)["status"], "Ready for QA")

    def test_one_context_replacement_per_card_role_and_qa_count_preserved(self):
        self.enable()
        self.develop()
        self.finish(self.start("qa", "VAR-101"), "changes_requested")
        dev = self.start("development", "VAR-101")
        replacement = self.transfer(dev)
        token = replacement["claim"]
        self.dispatcher.attach(token, "second-dev-context", "gpt-6-astra", replacement["workspace"])
        self.assertEqual(self.dispatcher.inspect(token)["qaFailures"], 1)
        with self.assertRaisesRegex(dispatch.BoardError, "already consumed"):
            self.transfer(token)
        self.finish(token)
        qa = self.start("qa", "VAR-101")
        qa_replacement = self.transfer(qa)
        self.dispatcher.attach(qa_replacement["claim"], "second-qa-context",
                               "gpt-6.1-sol", qa_replacement["workspace"])
        self.finish(qa_replacement["claim"])
        self.assertEqual(self.dispatcher.scan()["contextReplacements"],
                         {"VAR-101:development": 1, "VAR-101:qa": 1})

    def test_checkpoint_rejects_running_processes_unknown_work_and_oversize(self):
        self.enable()
        self.lane("VAR-101", "Development")
        token = self.start("development", "VAR-101")
        changes = {
            "ownedProcesses": ["still-running"], "remainingCriteria": ["VAR-999-AC1"],
            "qaFailures": 2, "sourceRefs": [], "signal": "", "summary": "word " * 801,
        }
        for field, value in changes.items():
            with self.subTest(field=field):
                record = self.checkpoint_record(token)
                record[field] = value
                with self.assertRaises(dispatch.BoardError):
                    self.transfer(token, record)
        self.assertEqual(self.dispatcher.scan()["contextReplacements"], {})

    def test_replacement_checks_frozen_checkpoint_and_keeps_pause_gate(self):
        self.enable()
        self.lane("VAR-101", "Development")
        token = self.start("development", "VAR-101")
        replacement = self.transfer(token)
        self.control("Dispatch", "Paused")
        with self.assertRaisesRegex(dispatch.BoardError, "paused"):
            self.dispatcher.attach(replacement["claim"], "new", "gpt-6-astra", replacement["workspace"])
        self.control("Dispatch", "Enabled")
        (Path(replacement["workspace"]) / "source.txt").write_text("drift", encoding="utf-8")
        with self.assertRaisesRegex(dispatch.BoardError, "after the checkpoint"):
            self.dispatcher.attach(replacement["claim"], "new", "gpt-6-astra", replacement["workspace"])

    def test_checkpoint_evidence_and_qa_candidate_cannot_change(self):
        self.enable()
        path = self.develop()
        qa = self.start("qa", "VAR-101")
        replacement = self.transfer(qa)
        checkpoint = self.root / replacement["checkpoint"]["path"]
        checkpoint.write_text("{}", encoding="utf-8")
        with self.assertRaisesRegex(dispatch.BoardError, "evidence changed"):
            self.dispatcher.attach(replacement["claim"], "fresh-qa", "gpt-6.1-sol", str(path))
        self.assertEqual(self.dispatcher.scan()["availableSlots"]["qa"], 1)

    def test_unattached_claim_and_foreign_evidence_cannot_complete(self):
        self.enable()
        self.lane("VAR-101", "Development")
        token = self.dispatcher.claim("development", "VAR-101", "run")["claim"]
        with self.assertRaisesRegex(dispatch.BoardError, "Attach"):
            self.dispatcher.complete(token, "missing.json", True, "fixture://stopped")
        self.dispatcher.attach(token, "worker", "gpt-6-astra", str(self.worktree("VAR-101")))
        foreign = Path(self.temporary.name) / "foreign.json"
        foreign.write_text(json.dumps(self.record(token)), encoding="utf-8")
        with self.assertRaisesRegex(dispatch.BoardError, "Save lifecycle records"):
            self.dispatcher.complete(token, str(foreign), True, "fixture://stopped")

    def test_unknown_worker_can_only_be_blocked_after_stop_confirmation(self):
        self.enable()
        self.lane("VAR-101", "Development")
        claim = self.dispatcher.claim("development", "VAR-101", "run")["claim"]
        with self.assertRaises(dispatch.BoardError):
            self.dispatcher.block(claim, "Launch uncertain", False, "Unknown")
        result = self.dispatcher.block(claim, "Launch never started", True, "fixture://launch-rejected")
        self.assertEqual(result["status"], "Blocked")
        self.assertEqual(self.dispatcher.scan()["availableSlots"]["development"], 2)

    def test_batch_two_requires_human_signoff_and_all_child_tasks(self):
        self.enable()
        self.control("Active batch", "2")
        self.lane("VAR-103", "Development")
        for card in dispatch.BATCHES["1"]:
            self.lane(card, "Done")
        with self.assertRaisesRegex(dispatch.BoardError, "sign-off"):
            self.dispatcher.claim("development", "VAR-103", "run")
        self.control("Batch 1 sign-off", "Approved")
        with self.assertRaisesRegex(dispatch.BoardError, "technical Tasks"):
            self.dispatcher.claim("development", "VAR-103", "run")
        for card in dispatch.BATCHES["1"]:
            self.lane(card + "-T01", "Done")
        self.assertEqual(self.dispatcher.scan()["eligible"]["development"], ["VAR-103"])

    def test_noncooperating_edit_is_detected_before_atomic_save(self):
        with self.dispatcher.locked_board() as board:
            external = self.board_path.read_text(encoding="utf-8") + "\nExternal note\n"
            self.board_path.write_text(external, encoding="utf-8")
            board.update("VAR-101", "Development", "Unassigned", "Change")
            with self.assertRaisesRegex(dispatch.BoardError, "changed during"):
                board.save()
        self.assertEqual(self.board_path.read_text(encoding="utf-8"), external)

    def test_corrupt_json_duplicate_controls_and_untracked_workers_fail_closed(self):
        original = self.board_path.read_text(encoding="utf-8")
        variants = [
            original.replace('"schemaVersion": 1', '"schemaVersion": true'),
            original.replace('"claims": {}', '"claims": {}, "claims": {}'),
            original + "| Dispatch | Enabled |\n",
            original.replace("| VAR-101 | Fixture | Package | To Do |",
                             "| VAR-101 | Fixture | Package | In Development |"),
        ]
        for text in variants:
            with self.subTest(text=text[:30]):
                self.board_path.write_text(text, encoding="utf-8")
                with self.assertRaises(dispatch.BoardError):
                    self.dispatcher.scan()
        self.board_path.write_text(original, encoding="utf-8")

    def test_cli_scan_is_model_free_and_errors_have_nonzero_exit(self):
        result = subprocess.run([sys.executable, "-B", str(SCRIPT), "--repo", str(self.root), "scan"],
                                capture_output=True, text=True, check=True)
        self.assertEqual(json.loads(result.stdout)["claims"], {})
        failure = subprocess.run(
            [sys.executable, "-B", str(SCRIPT), "--repo", str(self.root), "claim",
             "--role", "development", "--card", "VAR-101", "--run-id", "run"],
            capture_output=True, text=True, check=False,
        )
        self.assertEqual(failure.returncode, 2)
        self.assertIn("ERROR:", failure.stderr)


if __name__ == "__main__":
    unittest.main()
