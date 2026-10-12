from __future__ import annotations

import unittest

try:
    import replay_gate
except ImportError:  # Support module execution from the repository root.
    from tools.witmotion_ble import replay_gate


class ReplayGateTests(unittest.TestCase):
    """Formal test wrapper around the RIGHT_HAND_RAISE offline replay gate.

    This intentionally asserts the gate PASSES, so this test currently FAILS
    - that is the honest, correct signal: replay_gate.py's own printed
    report documents which of the ten acceptance criteria pass and which do
    not, and Balloon Quest must not be wired to real hardware (per the task
    this gate was built for) until it does.
    """

    def test_offline_replay_gate_passes(self) -> None:
        exit_code = replay_gate.main()
        self.assertEqual(exit_code, 0, "Offline replay gate did not pass - see printed report above for detail.")


if __name__ == "__main__":
    unittest.main()
