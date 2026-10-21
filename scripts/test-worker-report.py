"""Run CPU worker contracts with individual unittest results for the project report."""
import json
from pathlib import Path
import runpy
import sys
import time
import unittest


class RecordedResult(unittest.TextTestResult):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.records = []
        self.current = None

    def startTest(self, test):
        super().startTest(test)
        self.started = time.perf_counter()
        self.current = {"id": test.id(), "status": "passed"}

    def addFailure(self, test, err):
        super().addFailure(test, err)
        self.current.update(status="failed", error=self._exc_info_to_string(err, test))

    def addError(self, test, err):
        super().addError(test, err)
        self.current.update(status="failed", error=self._exc_info_to_string(err, test))

    def addSkip(self, test, reason):
        super().addSkip(test, reason)
        self.current.update(status="skipped", reason=reason)

    def addExpectedFailure(self, test, err):
        super().addExpectedFailure(test, err)
        self.current.update(status="expected-failure", reason=self._exc_info_to_string(err, test))

    def addUnexpectedSuccess(self, test):
        super().addUnexpectedSuccess(test)
        self.current.update(status="failed", error="Unexpected success of an expected-failure test")

    def addSubTest(self, test, subtest, err):
        super().addSubTest(test, subtest, err)
        if err:
            self.current.update(status="failed", error=self._exc_info_to_string(err, subtest))

    def stopTest(self, test):
        self.current["durationMs"] = round((time.perf_counter() - self.started) * 1000)
        self.records.append(self.current)
        super().stopTest(test)


def main():
    root = Path(__file__).resolve().parent.parent
    namespace = runpy.run_path(str(root / "tests" / "video-worker.py"))
    suite = unittest.TestSuite()
    for value in namespace.values():
        if isinstance(value, type) and issubclass(value, unittest.TestCase):
            suite.addTests(unittest.defaultTestLoader.loadTestsFromTestCase(value))
    result = unittest.TextTestRunner(verbosity=2, resultclass=RecordedResult).run(suite)
    target = Path(sys.argv[1])
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(result.records, indent=2) + "\n", encoding="utf-8")
    return 0 if result.wasSuccessful() and result.testsRun else 1


if __name__ == "__main__":
    raise SystemExit(main())
