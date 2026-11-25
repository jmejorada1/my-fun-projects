"""Prints a Markdown section listing surviving mutants from one or more reports.

Usage: python3 -I scripts/mutation-summary.py pit <src-root> <mutations.xml>...
       python3 -I scripts/mutation-summary.py stryker <src-root> <mutation.json>...
Called by scripts/mutation-report.sh.
"""
import json
import sys
import xml.etree.ElementTree as ET


def pit_mutants(report, src_root):
    # Trusted input: PIT's own report from the local build, not user data.
    for m in ET.parse(report).getroot():  # nosemgrep: python.lang.security.use-defused-xml-parse.use-defused-xml-parse
        outer_class = m.findtext("mutatedClass").split("$")[0]
        yield {
            "status": m.get("status"),
            "file": f"{src_root}/{outer_class.replace('.', '/')}.java",
            "line": int(m.findtext("lineNumber")),
            "mutator": m.findtext("mutator").rsplit(".", 1)[-1],
            "change": m.findtext("description"),
        }


def stryker_mutants(report, src_root):
    with open(report) as f:
        files = json.load(f)["files"]
    for path, data in files.items():
        for m in data["mutants"]:
            yield {
                "status": m["status"],
                "file": f"{src_root}/{path}",
                "line": m["location"]["start"]["line"],
                "mutator": m["mutatorName"],
                "change": f"→ `{m.get('replacement', '')}`".replace("\n", " ").replace("|", "\\|"),
            }


READERS = {"pit": pit_mutants, "stryker": stryker_mutants}
STATUS_GROUPS = {
    "KILLED": "killed", "Killed": "killed",
    "SURVIVED": "survived", "Survived": "survived",
    "NO_COVERAGE": "no coverage", "NoCoverage": "no coverage",
    "TIMED_OUT": "timed out", "Timeout": "timed out",
}


def main(tool, src_root, *reports):
    mutants = [m for report in reports for m in READERS[tool](report, src_root)]
    counts = {group: 0 for group in ["killed", "survived", "no coverage", "timed out", "other"]}
    for m in mutants:
        counts[STATUS_GROUPS.get(m["status"], "other")] += 1
    print(f"{len(mutants)} mutants: " + ", ".join(f"{n} {group}" for group, n in counts.items() if n) + ".\n")
    # A timeout counts as caught, but mass timeouts mean the runs were too slow, not the tests good.
    if mutants and counts["timed out"] > len(mutants) / 4:
        print("**Unreliable run:** over a quarter of the mutants timed out. Rerun before trusting it.\n")
    survived = [m for m in mutants if STATUS_GROUPS.get(m["status"]) == "survived"]
    if not survived:
        return
    print("| Location | Mutator | Change |")
    print("|---|---|---|")
    for m in sorted(survived, key=lambda m: (m["file"], m["line"])):
        print(f"| {m['file']}:{m['line']} | {m['mutator']} | {m['change']} |")
    print()


if __name__ == "__main__":
    if len(sys.argv) < 4 or sys.argv[1] not in READERS:
        sys.exit(__doc__)
    main(*sys.argv[1:])
