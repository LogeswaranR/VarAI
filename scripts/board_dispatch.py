#!/usr/bin/env python3
"""Guard POSIX local-board claims; never launch models or execute report commands."""

import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import uuid


MODELS = {"development": "gpt-6-astra", "qa": "gpt-6.1-sol"}
QUEUED = {"development": "Development", "qa": "Ready for QA"}
ACTIVE = {"development": "In Development", "qa": "In QA"}
BATCHES = {
    "1": ("VAR-101", "VAR-102", "VAR-105", "VAR-108"),
    "2": ("VAR-103", "VAR-104", "VAR-106", "VAR-107"),
}
PACKAGES = tuple(card for batch in BATCHES.values() for card in batch)
CONTROL_NAMES = {"Dispatch", "Active batch", "Approved baseline", "Batch 1 sign-off"}
DIGEST_PATTERN = re.compile(r"[0-9a-f]{64}")
REVISION_PATTERN = re.compile(r"[0-9a-f]{40}|[0-9a-f]{64}")
STATE_PATTERN = re.compile(
    r"(<!-- dispatch-state:start -->\n```json\n)(.*?)(\n```\n<!-- dispatch-state:end -->)",
    re.DOTALL,
)
CARD_PATTERN = re.compile(r"VAR-(?:E\d+|G\d+|\d+)(?:-T\d+)?")
LANES = {
    "To Do", "Doing", "Development", "In Development", "Ready for QA",
    "In QA", "Ready for Review", "Blocked", "Done",
}


class BoardError(Exception):
    pass


def require(condition, message):
    if not condition:
        raise BoardError(message)


def has_text(value):
    return isinstance(value, str) and bool(value.strip())


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, f"Duplicate JSON key: {key}")
        result[key] = value
    return result


def parse_json(text):
    try:
        return json.loads(text, object_pairs_hook=unique_object)
    except json.JSONDecodeError as error:
        raise BoardError(f"Invalid JSON at line {error.lineno}, column {error.colno}.") from error


def git(root, *arguments):
    result = subprocess.run(
        ["git", "-C", str(root), *arguments], capture_output=True, check=False
    )
    require(result.returncode == 0,
            f"Git {arguments[0]} validation failed (exit {result.returncode}); "
            "check the repository, worktree or approved baseline.")
    return result.stdout


def common_git_dir(root):
    return (root / os.fsdecode(git(root, "rev-parse", "--git-common-dir")).strip()).resolve()


def cell(value):
    return " ".join(str(value).split()).replace("|", "/")


class Board:
    def __init__(self, path):
        self.path = path
        self.original = path.read_text(encoding="utf-8")
        self.lines = self.original.splitlines()
        self.cards = {}
        self.controls = {}
        for index, line in enumerate(self.lines):
            if not line.startswith("|"):
                continue
            fields = [part.strip() for part in line.strip("|").split("|")]
            if fields and CARD_PATTERN.fullmatch(fields[0]):
                require(len(fields) == 6, f"Invalid board row: {fields[0]}")
                require(fields[0] not in self.cards, f"Duplicate board card: {fields[0]}")
                require(fields[3] in LANES, f"Unknown lane for {fields[0]}")
                self.cards[fields[0]] = (index, fields)
            elif len(fields) == 2 and fields[0] in CONTROL_NAMES:
                require(fields[0] not in self.controls, f"Duplicate control: {fields[0]}")
                self.controls[fields[0]] = fields[1]
        matches = list(STATE_PATTERN.finditer(self.original))
        require(len(matches) == 1, "Expected exactly one machine-managed dispatch-state block.")
        self.state = parse_json(matches[0][2])
        require(isinstance(self.state, dict), "Dispatch state must be an object.")
        require(type(self.state.get("schemaVersion")) is int and self.state["schemaVersion"] == 1,
                "Unsupported dispatch-state version.")
        require(set(self.state) == {
            "schemaVersion", "claims", "candidates", "qaFailures", "contextReplacements", "history"
        }, "Dispatch state fields are missing or unsupported; do not reset existing records.")
        for key in ("claims", "candidates", "qaFailures", "contextReplacements"):
            require(isinstance(self.state.get(key), dict), f"Invalid dispatch-state field: {key}")
        require(isinstance(self.state["history"], list), "Dispatch history must be an array.")
        for card in ("VAR-G00", "VAR-G00-T01", "VAR-G00-T02", "VAR-G00-T03", *PACKAGES):
            require(card in self.cards, f"Missing required card: {card}")
        require(set(self.controls) == CONTROL_NAMES, "Missing dispatch controls.")
        require(self.controls["Dispatch"] in {"Paused", "Enabled"}, "Invalid Dispatch control.")
        require(self.controls["Active batch"] in BATCHES, "Invalid active batch.")
        require(self.controls["Batch 1 sign-off"] in {"Pending", "Approved"}, "Invalid batch sign-off.")
        self.validate_claims()

    def status(self, card):
        require(card in self.cards, f"Unknown card: {card}")
        return self.cards[card][1][3]

    def validate_claims(self):
        seen, agents, workspaces = set(), set(), set()
        for card, candidate in self.state["candidates"].items():
            require(card in PACKAGES and isinstance(candidate, dict), "Invalid candidate record.")
            for field in ("workspace", "baseline", "fingerprint", "developerAgentId",
                          "developmentEvidence", "developmentEvidenceHash"):
                require(has_text(candidate.get(field)), f"Missing candidate {field}: {card}")
            require(DIGEST_PATTERN.fullmatch(candidate["fingerprint"]) is not None,
                    f"Invalid candidate fingerprint: {card}")
            require(REVISION_PATTERN.fullmatch(candidate["baseline"]) is not None,
                    f"Invalid candidate baseline: {card}")
        for token, claim in self.state["claims"].items():
            require(re.fullmatch(r"[0-9a-f]{32}", token) is not None, "Invalid claim identifier.")
            require(isinstance(claim, dict), f"Invalid claim record: {token}")
            role, card = claim.get("role"), claim.get("card")
            require(has_text(role) and role in MODELS and has_text(card) and card in PACKAGES,
                    "Invalid claimed role or card.")
            require(card not in seen, f"Duplicate active claim: {card}")
            require(claim.get("model") == MODELS[role], f"Wrong requested model for {card}")
            require(self.status(card) == ACTIVE[role], f"Lane/claim mismatch for {card}; reconcile manually.")
            require(self.cards[card][1][4] == f"{role}:{token}", f"Owner/claim mismatch for {card}.")
            require(has_text(claim.get("phase")) and claim["phase"] in {"reserved", "running"},
                    f"Invalid claim phase: {card}")
            for field in ("baseline", "runId", "startedAt", "requirementsFingerprint"):
                require(has_text(claim.get(field)), f"Missing claim {field}: {card}")
            require(REVISION_PATTERN.fullmatch(claim["baseline"]) is not None,
                    f"Invalid claim baseline: {card}")
            require(DIGEST_PATTERN.fullmatch(claim["requirementsFingerprint"]) is not None,
                    f"Invalid requirements fingerprint: {card}")
            require("agentId" in claim and "workspace" in claim, f"Missing worker fields: {card}")
            if claim["phase"] == "running":
                require(has_text(claim["agentId"]) and has_text(claim["workspace"]),
                        f"Running claim has no worker/workspace: {card}")
            else:
                require(claim["agentId"] is None, f"Reserved claim already has an active worker: {card}")
            if claim["agentId"] is not None:
                require(has_text(claim["agentId"]) and claim["agentId"] not in agents,
                        "Worker IDs cannot own multiple claims.")
                agents.add(claim["agentId"])
            if claim["workspace"] is not None:
                require(has_text(claim["workspace"]) and claim["workspace"] not in workspaces,
                        "Active workers cannot share a worktree.")
                workspaces.add(claim["workspace"])
            checkpoint = claim.get("checkpoint")
            if checkpoint is not None:
                require(isinstance(checkpoint, dict) and all(
                    has_text(checkpoint.get(field)) for field in ("path", "hash", "fingerprint")
                ), "Invalid replacement checkpoint.")
            seen.add(card)
        for role, lane in ACTIVE.items():
            active = {card for card in self.cards if self.status(card) == lane}
            claimed = {claim["card"] for claim in self.state["claims"].values() if claim["role"] == role}
            require(active == claimed, f"Untracked {role} activity; do not redispatch.")
            require(len(active) <= 2, f"The {role} capacity exceeds two.")
        for card, count in self.state["qaFailures"].items():
            require(card in PACKAGES and type(count) is int and 0 <= count <= 3,
                    "Invalid QA correction count.")
        for key, count in self.state["contextReplacements"].items():
            require(key in {f"{card}:{role}" for card in PACKAGES for role in MODELS}
                    and type(count) is int and 0 <= count <= 1, "Invalid context-replacement count.")
        for card in self.cards:
            lane = self.status(card)
            if lane in {*QUEUED.values(), *ACTIVE.values(), "Ready for Review"}:
                require(card in PACKAGES, "Only parent feature packages can use automatic lanes.")
            if lane in {"Ready for QA", "In QA", "Ready for Review"}:
                require(card in self.state["candidates"], f"{card} requires a recorded development candidate.")
        for event in self.state["history"]:
            require(isinstance(event, dict) and has_text(event.get("card")) and event["card"] in PACKAGES
                    and has_text(event.get("role")) and event["role"] in MODELS
                    and all(has_text(event.get(field)) for field in ("claim", "event", "at", "stopEvidence")),
                    "Invalid lifecycle history.")

    def update(self, card, lane, owner, note):
        index, fields = self.cards[card]
        fields[3:] = [lane, owner, cell(note)]
        self.lines[index] = "| " + " | ".join(fields) + " |"

    def save(self):
        self.validate_claims()
        text = "\n".join(self.lines) + "\n"
        text = STATE_PATTERN.sub(
            lambda match: match[1] + json.dumps(self.state, indent=2, sort_keys=True) + match[3],
            text,
        )
        require(self.path.read_text(encoding="utf-8") == self.original,
                "Board changed during dispatch; no update was written. Retry after reconciling edits.")
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(
                mode="w", encoding="utf-8", dir=self.path.parent, prefix=".board-", delete=False
            ) as handle:
                temporary = Path(handle.name)
                handle.write(text)
                handle.flush()
                os.fsync(handle.fileno())
            os.chmod(temporary, self.path.stat().st_mode & 0o777)
            require(self.path.read_text(encoding="utf-8") == self.original,
                    "Board changed before replacement; no update was written.")
            os.replace(temporary, self.path)
        finally:
            if temporary is not None and temporary.exists():
                temporary.unlink()


class Dispatcher:
    def __init__(self, root, lock_path=None):
        self.root = Path(root).resolve()
        require((self.root / ".git").is_dir(), "Use the canonical main checkout, not a worker worktree.")
        require(Path(os.fsdecode(git(self.root, "rev-parse", "--show-toplevel")).strip()).resolve()
                == self.root, "Use the canonical repository root.")
        self.board_path = self.root / "docs/backlog/board.md"
        self.lock_path = lock_path or common_git_dir(self.root) / "varai-workflow/dispatch.lock"

    @contextmanager
    def locked_board(self):
        self.lock_path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        descriptor = os.open(self.lock_path, os.O_CREAT | os.O_RDWR, 0o600)
        with os.fdopen(descriptor, "a") as handle:
            fcntl.flock(handle, fcntl.LOCK_EX)
            yield Board(self.board_path)

    def readiness(self, board):
        reasons = []
        if board.controls["Dispatch"] != "Enabled":
            reasons.append("Board dispatch is paused.")
        if any(board.status(card) != "Done" for card in
               ("VAR-G00", "VAR-G00-T01", "VAR-G00-T02", "VAR-G00-T03")):
            reasons.append("G00 and its technical Tasks are not complete.")
        baseline = board.controls["Approved baseline"]
        if not REVISION_PATTERN.fullmatch(baseline):
            reasons.append("An approved full baseline commit ID has not been recorded.")
        else:
            git(self.root, "cat-file", "-e", baseline + "^{commit}")
            for path in ("docs/backlog/board.md", "docs/backlog/contract-v0.2.md",
                         "docs/backlog/technical-tasks.md", ".github/copilot-instructions.md",
                         "scripts/board_dispatch.py", "package.json", "VarAI.slnx"):
                git(self.root, "cat-file", "-e", f"{baseline}:{path}")
        if board.controls["Active batch"] == "2":
            if board.controls["Batch 1 sign-off"] != "Approved":
                reasons.append("Batch 1 human sign-off is missing.")
            if any(board.status(card) != "Done" for card in board.cards
                   if any(card == parent or card.startswith(parent + "-T") for parent in BATCHES["1"])):
                reasons.append("Batch 1 packages and technical Tasks are not all Done.")
        return reasons

    def requirements_fingerprint(self):
        digest = hashlib.sha256()
        for name in ("README.md", "technical-tasks.md", "contract-v0.2.md"):
            digest.update(name.encode() + (self.root / "docs/backlog" / name).read_bytes())
        digest.update((self.root / ".github/copilot-instructions.md").read_bytes())
        return digest.hexdigest()

    def check_claim_context(self, board, claim):
        require(claim["baseline"] == board.controls["Approved baseline"],
                "The approved baseline changed during this claim.")
        require(claim["requirementsFingerprint"] == self.requirements_fingerprint(),
                "Requirements changed during this claim; reconcile before continuing.")

    def criteria(self, card):
        pattern = r"\[(" + re.escape(card) + r"(?:-T\d+)?-AC\d+)\]"
        result = set()
        for name in ("README.md", "technical-tasks.md"):
            result.update(re.findall(pattern, (self.root / "docs/backlog" / name).read_text(encoding="utf-8")))
        require(bool(result), "No acceptance criteria were found for the card.")
        return result

    def snapshot(self, workspace, baseline):
        path = Path(workspace).resolve()
        require(path != self.root, "Workers must not use the canonical board checkout.")
        require(path.is_dir(), "Worker workspace does not exist.")
        top = Path(os.fsdecode(git(path, "rev-parse", "--show-toplevel")).strip()).resolve()
        require(path == top, "Use the worker worktree root, not a subdirectory.")
        require(common_git_dir(path) == common_git_dir(self.root), "Worker is not in this repository's worktrees.")
        require((path / ".git").is_file(), "Use a linked worker worktree.")
        git(path, "merge-base", "--is-ancestor", baseline, "HEAD")
        require(not git(path, "ls-files", "--unmerged"), "Resolve worktree index conflicts before handoff.")
        digest = hashlib.sha256()
        digest.update(git(path, "rev-parse", "HEAD"))
        digest.update(git(path, "ls-files", "--stage", "-z"))
        names = set(git(path, "ls-files", "-z", "--cached", "--others", "--exclude-standard").split(b"\0"))
        for name in sorted(names - {b""}):
            target = path / os.fsdecode(name)
            digest.update(len(name).to_bytes(8, "big") + name)
            require(target.parent.resolve().is_relative_to(path),
                    "A worker path resolves outside the worktree.")
            if target.is_symlink():
                data = b"link:" + os.fsencode(os.readlink(target))
            elif target.is_file():
                data = str(target.stat().st_mode & 0o777).encode() + b":" + target.read_bytes()
            else:
                require(not target.exists(), "Submodules or special worktree files are not supported.")
                data = b"missing"
            digest.update(len(data).to_bytes(8, "big") + data)
        return digest.hexdigest()

    def scan(self):
        with self.locked_board() as board:
            blockers = self.readiness(board)
            eligible = {
                role: [card for card in BATCHES[board.controls["Active batch"]]
                       if board.status(card) == lane and board.state["qaFailures"].get(card, 0) < 3]
                if not blockers else []
                for role, lane in QUEUED.items()
            }
            available = {
                role: 2 - sum(claim["role"] == role for claim in board.state["claims"].values())
                for role in MODELS
            }
            return {"blockers": blockers, "eligible": eligible, "availableSlots": available,
                    "requestedModels": MODELS, "claims": board.state["claims"],
                    "contextReplacements": board.state["contextReplacements"],
                    "qaFailures": board.state["qaFailures"]}

    def claim(self, role, card, run_id):
        require(role in MODELS, "Unknown role.")
        require(has_text(run_id), "A coordinator run ID is required.")
        with self.locked_board() as board:
            blockers = self.readiness(board)
            require(not blockers, " ".join(blockers))
            require(card in BATCHES[board.controls["Active batch"]], "Card is outside the active batch.")
            require(board.status(card) == QUEUED[role], "Card is not in the requested queue.")
            require(board.state["qaFailures"].get(card, 0) < 3, "QA correction limit reached.")
            require(sum(claim["role"] == role for claim in board.state["claims"].values()) < 2,
                    f"No {role} slot is available.")
            candidate = board.state["candidates"].get(card)
            previous_workspace = next(
                (event.get("workspace") for event in reversed(board.state["history"])
                 if event["card"] == card and event.get("workspace")), None
            )
            if role == "qa":
                require(isinstance(candidate, dict), "QA requires a saved development candidate.")
                require(candidate.get("baseline") == board.controls["Approved baseline"],
                        "Candidate baseline differs from the approved baseline.")
                require(self.snapshot(candidate["workspace"], candidate["baseline"]) == candidate["fingerprint"],
                        "Candidate changed after development; do not dispatch QA.")
                self.read_record(candidate["developmentEvidence"], candidate["developmentEvidenceHash"])
            token = uuid.uuid4().hex
            claim = {"card": card, "role": role, "model": MODELS[role],
                     "baseline": board.controls["Approved baseline"], "runId": run_id,
                     "startedAt": datetime.now(timezone.utc).isoformat(), "agentId": None,
                     "workspace": candidate["workspace"] if candidate else previous_workspace,
                     "phase": "reserved", "checkpoint": None,
                     "requirementsFingerprint": self.requirements_fingerprint()}
            board.state["claims"][token] = claim
            board.update(card, ACTIVE[role], f"{role}:{token}", f"Reserved by {run_id}; awaiting worker attachment.")
            board.save()
            return {"claim": token, **claim, "previousCandidate": candidate}

    def attach(self, token, agent_id, model, workspace):
        require(has_text(agent_id), "A real worker ID is required.")
        with self.locked_board() as board:
            blockers = self.readiness(board)
            require(not blockers, " ".join(blockers))
            require(token in board.state["claims"], "Unknown or completed claim.")
            claim = board.state["claims"][token]
            self.check_claim_context(board, claim)
            require(claim["phase"] == "reserved" and claim["agentId"] is None,
                    "This claim already has a worker.")
            require(model == MODELS[claim["role"]], "Worker model does not match the requested role.")
            used_agents = {other["agentId"] for other in board.state["claims"].values()
                           if other["agentId"] is not None}
            used_agents.update(event.get("agentId") for event in board.state["history"])
            require(agent_id not in used_agents, "Use a fresh worker identity; old workers cannot be reassigned.")
            workspace = str(Path(workspace).resolve())
            fingerprint = self.snapshot(workspace, claim["baseline"])
            if claim["workspace"]:
                require(workspace == claim["workspace"], "The reserved worktree cannot change.")
            for other in board.state["claims"].values():
                if other is not claim:
                    require(other["workspace"] != workspace, "This worktree is already claimed.")
            for other_card, other in board.state["candidates"].items():
                if other_card != claim["card"]:
                    require(other["workspace"] != workspace, "Use a dedicated worktree for each card.")
            candidate = board.state["candidates"].get(claim["card"])
            if candidate:
                require(workspace == candidate["workspace"], "Continue with the recorded card worktree.")
            if claim["role"] == "qa":
                require(fingerprint == candidate["fingerprint"], "Candidate changed before QA attachment.")
                require(agent_id != candidate["developerAgentId"], "QA must be independent of the developer.")
            if claim["checkpoint"]:
                checkpoint = claim["checkpoint"]
                self.read_record(checkpoint["path"], checkpoint["hash"])
                require(fingerprint == checkpoint["fingerprint"], "Worktree changed after the checkpoint.")
            claim.update(agentId=agent_id, workspace=workspace, phase="running")
            board.update(claim["card"], ACTIVE[claim["role"]], f"{claim['role']}:{token}",
                         f"Worker {agent_id}; claim {token}.")
            board.save()
            return {"attached": token}

    def read_record(self, record_path, expected_hash=None):
        require(has_text(str(record_path)), "A record path is required.")
        path = Path(record_path)
        path = (self.root / path).resolve() if not path.is_absolute() else path.resolve()
        storage = common_git_dir(self.root) / "varai-workflow"
        require(path.is_relative_to(storage), "Save lifecycle records in .git/varai-workflow, not source files.")
        require(path.is_file() and path.stat().st_size <= 65536, "Lifecycle record is missing or exceeds 64 KiB.")
        data = path.read_bytes()
        digest = hashlib.sha256(data).hexdigest()
        require(expected_hash is None or expected_hash == digest, "Saved lifecycle evidence changed.")
        try:
            record = parse_json(data.decode("utf-8"))
        except UnicodeDecodeError as error:
            raise BoardError("Lifecycle records must be UTF-8 JSON.") from error
        require(isinstance(record, dict) and type(record.get("schemaVersion")) is int
                and record["schemaVersion"] == 1, "Invalid lifecycle record version.")
        return record, str(path.relative_to(self.root)), digest

    def worker_record(self, token, claim, path):
        record, relative, digest = self.read_record(path)
        require(record.get("claim") == token and record.get("agentId") == claim["agentId"],
                "Record is not bound to this claim and worker.")
        require(record.get("card") == claim["card"] and record.get("role") == claim["role"],
                "Record does not match the claimed card and role.")
        require(record.get("model") == claim["model"] and record.get("baseline") == claim["baseline"],
                "Record model or baseline differs from the claim.")
        require(record.get("workspace") == claim["workspace"], "Record worktree differs from the claim.")
        fingerprint = self.snapshot(claim["workspace"], claim["baseline"])
        require(record.get("fingerprint") == fingerprint, "Record describes a stale worktree snapshot.")
        return record, relative, digest

    def report(self, token, claim, report_path):
        report, relative, digest = self.worker_record(token, claim, report_path)
        require(report.get("card") == claim["card"] and report.get("role") == claim["role"],
                "Evidence does not match the claimed card and role.")
        require(has_text(report.get("verdict")) and report["verdict"] in {
            "pass", "changes_requested", "blocked"
        }, "Unknown verdict.")
        require(isinstance(report.get("summary"), str) and report["summary"].strip(), "Evidence needs a summary.")
        checks, findings = report.get("checks"), report.get("findings")
        require(isinstance(checks, list) and isinstance(findings, list), "Evidence needs checks and findings arrays.")
        for check in checks:
            require(isinstance(check, dict) and isinstance(check.get("command"), str)
                    and check["command"].strip() and type(check.get("exitCode")) is int
                    and isinstance(check.get("evidence"), str) and check["evidence"].strip(),
                    "Each check needs a command, numeric exit code and evidence reference.")
        for finding in findings:
            require(isinstance(finding, dict) and type(finding.get("blocking")) is bool
                    and isinstance(finding.get("evidence"), str) and finding["evidence"].strip(),
                    "Each finding needs a blocking flag and evidence.")
        if report["verdict"] == "pass":
            require(checks and all(check["exitCode"] == 0 for check in checks), "Passing handoffs require passing checks.")
            require(not any(finding["blocking"] for finding in findings), "Blocking findings prevent a pass.")
            expected = self.criteria(claim["card"])
            criteria = report.get("criteria")
            require(expected and isinstance(criteria, list), "Passing handoffs need criterion-level evidence.")
            require(all(isinstance(item, dict) and has_text(item.get("id")) and item.get("result") == "passed"
                        and isinstance(item.get("evidence"), str) and item["evidence"].strip()
                        for item in criteria), "Every criterion needs passing evidence.")
            require(len(criteria) == len(expected) and {item.get("id") for item in criteria} == expected,
                    "Criterion coverage does not match the card and its technical Tasks.")
        elif report["verdict"] == "changes_requested":
            require(claim["role"] == "qa" and any(finding["blocking"] for finding in findings),
                    "Only QA with blocking findings can request corrections.")
        return report, relative, digest

    def inspect(self, token):
        with self.locked_board() as board:
            require(token in board.state["claims"], "Unknown or completed claim.")
            claim = board.state["claims"][token]
            self.check_claim_context(board, claim)
            result = {"claim": token, **claim, "criteria": sorted(self.criteria(claim["card"])),
                      "qaFailures": board.state["qaFailures"].get(claim["card"], 0),
                      "contextReplacements": board.state["contextReplacements"].get(
                          f"{claim['card']}:{claim['role']}", 0)}
            if claim["workspace"]:
                result["fingerprint"] = self.snapshot(claim["workspace"], claim["baseline"])
            return result

    def record_stop(self, board, token, claim, event, stop_evidence):
        board.state["history"].append({
            "claim": token, "card": claim["card"], "role": claim["role"],
            "agentId": claim["agentId"], "model": claim["model"],
            "workspace": claim["workspace"], "baseline": claim["baseline"],
            "runId": claim["runId"], "event": event,
            "at": datetime.now(timezone.utc).isoformat(), "stopEvidence": stop_evidence,
        })

    def complete(self, token, report_path, worker_stopped=False, stop_evidence=""):
        require(worker_stopped and has_text(stop_evidence),
                "Confirm worker and owned writers are stopped, with runtime evidence, before handoff.")
        with self.locked_board() as board:
            require(token in board.state["claims"], "Unknown or completed claim.")
            claim = board.state["claims"][token]
            require(claim["phase"] == "running", "Attach a verified worker before completing its claim.")
            self.check_claim_context(board, claim)
            report, evidence, evidence_hash = self.report(token, claim, report_path)
            fingerprint = self.snapshot(claim["workspace"], claim["baseline"])
            require(fingerprint == report["fingerprint"], "Worktree changed while validating the handoff.")
            card, role = claim["card"], claim["role"]
            if role == "qa":
                require(fingerprint == board.state["candidates"][card]["fingerprint"],
                        "Candidate changed during QA; keep the claim and reconcile, do not accept the review.")
            verdict = report["verdict"]
            if verdict == "pass" and role == "development":
                board.state["candidates"][card] = {
                    "workspace": claim["workspace"], "baseline": claim["baseline"],
                    "fingerprint": fingerprint, "developerAgentId": claim["agentId"],
                    "developmentEvidence": evidence, "developmentEvidenceHash": evidence_hash,
                }
                lane = "Ready for QA"
            elif verdict == "pass":
                board.state["candidates"][card]["qaEvidence"] = evidence
                board.state["candidates"][card]["qaEvidenceHash"] = evidence_hash
                lane = "Ready for Review"
            elif verdict == "changes_requested":
                failures = board.state["qaFailures"].get(card, 0) + 1
                board.state["qaFailures"][card] = failures
                lane = "Development" if failures <= 2 else "Blocked"
            else:
                lane = "Blocked"
            self.record_stop(board, token, claim, f"complete:{verdict}", stop_evidence)
            del board.state["claims"][token]
            note = f"{report['summary']} Evidence: {evidence}."
            if lane == "Blocked":
                note += " Coordinator must report the blocker and obtain the next decision."
            board.update(card, lane, "Unassigned", note)
            board.save()
            return {"card": card, "status": lane, "qaFailures": board.state["qaFailures"].get(card, 0)}

    def checkpoint(self, token, checkpoint_path, worker_stopped=False, stop_evidence=""):
        require(worker_stopped and has_text(stop_evidence),
                "Confirm old-worker shutdown and stopped writers before reserving a replacement.")
        with self.locked_board() as board:
            require(token in board.state["claims"], "Unknown or completed claim.")
            claim = board.state["claims"][token]
            require(claim["phase"] == "running", "Only an attached worker can transfer context.")
            self.check_claim_context(board, claim)
            key = f"{claim['card']}:{claim['role']}"
            require(board.state["contextReplacements"].get(key, 0) == 0,
                    "One replacement per card/role is already consumed; escalate to the user.")
            checkpoint, relative, digest = self.worker_record(token, claim, checkpoint_path)
            require(has_text(checkpoint.get("reason")) and checkpoint["reason"] in {
                "context_pressure", "repeated_no_progress", "requirements_lost", "user_requested"
            }, "Unknown context-handoff reason.")
            for field in ("signal", "summary", "nextStep", "permissions"):
                require(has_text(checkpoint.get(field)), f"Checkpoint needs {field}.")
            for field in ("changedFiles", "decisions", "checks", "failedApproaches", "blockers",
                          "sourceRefs", "pendingApprovals"):
                value = checkpoint.get(field)
                require(isinstance(value, list) and all(has_text(entry) for entry in value),
                        f"Checkpoint needs a text array for {field}.")
            required_refs = {"docs/backlog/board.md", "docs/backlog/README.md",
                             "docs/backlog/technical-tasks.md", "docs/backlog/contract-v0.2.md"}
            require(required_refs <= set(checkpoint["sourceRefs"]), "Checkpoint is missing source-of-truth references.")
            remaining = checkpoint.get("remainingCriteria")
            require(isinstance(remaining, list) and remaining and all(has_text(item) for item in remaining)
                    and set(remaining) <= self.criteria(claim["card"]),
                    "Checkpoint must identify actual remaining acceptance criteria.")
            require(type(checkpoint.get("qaFailures")) is int
                    and checkpoint["qaFailures"] == board.state["qaFailures"].get(claim["card"], 0),
                    "Checkpoint must preserve the QA correction count.")
            require(type(checkpoint.get("contextReplacements")) is int
                    and checkpoint["contextReplacements"] == 0, "Checkpoint has an incorrect recovery count.")
            require(checkpoint.get("ownedProcesses") == [],
                    "Confirm owned processes have stopped; do not transfer a live writer.")
            require(len(json.dumps(checkpoint).split()) <= 800, "Keep the checkpoint within 800 whitespace-separated words.")
            if claim["role"] == "qa":
                require(checkpoint["fingerprint"] == board.state["candidates"][claim["card"]]["fingerprint"],
                        "The QA candidate changed; do not transfer this review.")
            replacement = uuid.uuid4().hex
            self.record_stop(board, token, claim, "context-replacement", stop_evidence)
            board.state["contextReplacements"][key] = 1
            del board.state["claims"][token]
            claim.update(agentId=None, phase="reserved",
                         checkpoint={"path": relative, "hash": digest,
                                     "fingerprint": checkpoint["fingerprint"]})
            board.state["claims"][replacement] = claim
            board.update(claim["card"], ACTIVE[claim["role"]], f"{claim['role']}:{replacement}",
                         f"Replacement reserved; old claim invalidated. Checkpoint: {relative}.")
            board.save()
            return {"claim": replacement, **claim}

    def block(self, token, reason, worker_stopped=False, stop_evidence=""):
        require(worker_stopped, "Verify the worker never started or is stopped before releasing capacity.")
        require(has_text(reason) and has_text(stop_evidence), "A blocker reason and stop evidence are required.")
        with self.locked_board() as board:
            require(token in board.state["claims"], "Unknown or completed claim.")
            claim = board.state["claims"].pop(token)
            self.record_stop(board, token, claim, "blocked", stop_evidence)
            board.update(claim["card"], "Blocked", "Unassigned",
                         f"{reason} Coordinator: record the next decision before retrying.")
            board.save()
            return {"card": claim["card"], "status": "Blocked"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[1],
                        help="Canonical repository checkout, never a worker copy.")
    commands = parser.add_subparsers(dest="action", required=True)
    commands.add_parser("scan")
    claim = commands.add_parser("claim")
    claim.add_argument("--role", choices=tuple(MODELS), required=True)
    claim.add_argument("--card", required=True)
    claim.add_argument("--run-id", required=True)
    attach = commands.add_parser("attach")
    attach.add_argument("--claim", dest="token", required=True)
    attach.add_argument("--agent-id", required=True)
    attach.add_argument("--model", choices=tuple(MODELS.values()), required=True)
    attach.add_argument("--workspace", required=True)
    inspect = commands.add_parser("inspect")
    inspect.add_argument("--claim", dest="token", required=True)
    complete = commands.add_parser("complete")
    complete.add_argument("--claim", dest="token", required=True)
    complete.add_argument("--report", dest="report_path", required=True)
    complete.add_argument("--worker-stopped", action="store_true")
    complete.add_argument("--stop-evidence", required=True)
    checkpoint = commands.add_parser("checkpoint")
    checkpoint.add_argument("--claim", dest="token", required=True)
    checkpoint.add_argument("--checkpoint", dest="checkpoint_path", required=True)
    checkpoint.add_argument("--worker-stopped", action="store_true")
    checkpoint.add_argument("--stop-evidence", required=True)
    block = commands.add_parser("block")
    block.add_argument("--claim", dest="token", required=True)
    block.add_argument("--reason", required=True)
    block.add_argument("--worker-stopped", action="store_true")
    block.add_argument("--stop-evidence", required=True)
    arguments = vars(parser.parse_args())
    action = arguments.pop("action")
    dispatcher = Dispatcher(arguments.pop("repo"))
    result = getattr(dispatcher, action)(**arguments)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (BoardError, OSError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        sys.exit(2)
