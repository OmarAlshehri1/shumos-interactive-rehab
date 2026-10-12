"""Continuous RIGHT_HAND_RAISE semantic-event detection.

This module adds two things on top of ``calibration_engine.py``: a
continuous, streaming wrapper around its deterministic primitives
(``BaselineProfile``, ``PersonalizedMovementDetector``), and a dynamic,
continuously-adapting personalized rest envelope that replaces the earlier
frozen-baseline / exact-return design.

State machine:

    IDLE -> GESTURE_ACTIVE -> SETTLING -> IDLE

- IDLE: ``OnsetEvidence`` watches every sample against the CURRENT rest
  envelope for dual-path evidence of intentional motion (fast burst or slow
  coherent displacement - see its own docstring). Any sample that is not
  onset evidence instead nudges the rest envelope's own pose slowly
  (``IDLE_DRIFT_EMA_ALPHA``) - real posture drift, strap settling, or a
  therapist's support over a multi-minute session is absorbed continuously,
  without ever opening a gesture candidate for it.
- GESTURE_ACTIVE: unchanged from this module's earlier CANDIDATE_UP design
  (see the TRAJECTORY_* constants below) - a fresh
  ``PersonalizedMovementDetector`` against a FROZEN snapshot of the rest
  envelope taken the instant onset evidence fired, extended until its
  trajectory commits (settles, shows a real drop from its peak, or hits a
  safety cap), then classified via ``classify_trajectory`` exactly as
  before. This layer is deliberately untouched - it already correctly
  separates this user's personalized UP from their other enrolled
  directions (see below); the problem being solved by everything else in
  this module sits below it, not in it.
- SETTLING: ``SettledStateTest`` - has motion genuinely stopped, ANYWHERE,
  not necessarily back at the pre-gesture pose (see CRITICAL - REST MAY MOVE
  below). Runs identically whether the just-committed movement was accepted
  or rejected. Once confirmed, the settled window's own pose becomes the
  new rest envelope center and a fresh ``OnsetEvidence`` starts watching
  immediately - this is the "release" a real, multi-minute rehab session
  needs: the previous intentional movement has clearly ended and the hand
  has settled, not that it returned to one frozen angle captured at session
  start.

==============================================================================
WHY THIS REDESIGN EXISTS (evidence, not a hypothetical)
==============================================================================

The previous design (RETURNING / NeutralRegionTest, replaced here by
SETTLING / SettledStateTest) required proximity back to the ARMED baseline's
pose, scaled by the movement's own peak, before rearming. That worked well
enough on this session's short, single-purpose calibration recordings, but a
real, ground-truth-marked capture of one continuous ~2.5-minute session
(normal_full_raise_clean_rep01.csv - 5 real repetitions, each independently
marked with neutral_confirmed/raise_requested/movement_started/
movement_peak_trigger/lowering_requested/neutral_release_confirmed/
repetition_complete, recorded via capture_normal_full_clean.py) exposed the
actual failure mode directly: after the first two repetitions, sub-degree
natural resting variation (postural sway, not a repeat gesture) repeatedly
crossed PersonalizedMovementDetector's onset threshold against an
increasingly stale frozen baseline, opened a candidate, correctly got
rejected by direction (nearest prototype "down"/"down_right" at cosine up to
0.98 - the classifier was never wrong), then NeutralRegionTest's own
proximity-to-baseline requirement fed the rearm from whatever pose that
rejected candidate happened to end at - not genuine rest. Seven such cycles
in a row, over roughly two minutes, swallowed real repetitions 3, 4, and 5
entirely (their actual raise motions landed inside one of these spurious
candidate/reject/rearm cycles and never got evaluated as their own clean
onset) and drifted the baseline pose by up to 23 degrees net. The same
capture's own live ReleaseDetector (calibration_engine.py, used unmodified
during the real-time capture, independent of anything in this file) needed
66 seconds to confirm repetition 3's release - not because a human
physiologically needs 66 seconds to rest, but because it too was requiring
proximity back to an exact prior pose rather than recognizing a merely
different, settled one.

==============================================================================
IDLE: A DYNAMIC REST ENVELOPE, NOT A FROZEN POSE
==============================================================================

The rest envelope's *pose* is a slow exponential moving average
(``IDLE_DRIFT_EMA_ALPHA``), updated every IDLE sample that is not itself
onset evidence; its *noise floor* stays fixed, sourced once from this user's
own deliberate calibration (mirrors ``_repose()``, already used elsewhere in
this module before this redesign). This is a deliberate separation:
micro-motion / rest drift (posture, strap settling, arm fatigue, a new
comfortable resting pose) should slowly move WHERE "rest" is considered to
be, while what counts as "meaningfully more motion than that" stays anchored
to this user's own measured noise, not to a moving target.

==============================================================================
ONSET REQUIRES EVIDENCE OF INTENT, NOT ONE THRESHOLD CROSSING
==============================================================================

``OnsetEvidence`` runs continuously against the CURRENT rest envelope and
supports two legitimate onset paths, evaluated over a short rolling window
(deliberately not requiring all signals simultaneously, which would reject
slow movement):

- FAST: gyro AND acceleration both clearly elevated (reuses
  PersonalizedMovementDetector's own already-validated onset multipliers)
  for a couple of consecutive samples - a sudden, obviously intentional
  movement.
- SLOW: net displacement accumulated over the window exceeds this user's own
  personalized minimum-usable-movement floor (reuses
  PersonalizedMovementDetector's own displacement-valid multiplier) AND that
  displacement is directionally coherent (net/path ratio) rather than
  oscillatory - a slow intentional movement still steadily grows in one
  direction, while natural sway wanders back and forth without ever
  accumulating much net displacement relative to how far it has actually
  moved sample-to-sample.

Only once one of these paths fires does a ``PersonalizedMovementDetector``
even get constructed - and it is fed the SAME rolling window's buffered raw
samples (not just the one sample where evidence finally crossed the line),
so the trajectory-classification layer downstream sees the movement's real
run-up, not a truncated tail of it.

==============================================================================
CRITICAL - REST MAY MOVE
==============================================================================

After a gesture (accepted or rejected) the wearer does not need to return to
the exact pre-gesture angle - important for rehabilitation, where an arm may
reasonably settle into a slightly different comfortable position after
moving. SETTLING / ``SettledStateTest`` therefore asks only whether recent
samples are LOCALLY stable (tightly clustered around their own recent
center) and quiet (low angular velocity), independent of where that center
is relative to where the gesture started. The settled window's own pose
becomes the new rest center (SETTLING -> IDLE, NEW_REST_CONFIRMED) - a
second RIGHT_HAND_RAISE is never created merely because the rest center
moved, since SETTLING does not classify anything; only GESTURE_ACTIVE's
commit does, exactly once per gesture, unchanged from before.

==============================================================================
TRAJECTORY, NOT ONE INSTANTANEOUS SAMPLE (GESTURE_ACTIVE, unchanged layer)
==============================================================================

``raise_alignment``'s fixed 0.35 share cutoff judges a single angle-delta
vector. Historically that vector was ``PersonalizedMovementDetector``'s
snapshot at the very first sample where its own minimum acceptance
conditions became true - which, for anything but the smallest movements,
arrives well before the movement itself has finished developing (verified:
medium_raise_rep01.csv and normal_full_raise_rep01.csv both regularly first
satisfy the detector's onset/coherence conditions on a transient early
sample carrying 10-30% raise-axis share, while the *same* repetition's
later, still-growing peak - once the arm actually finishes rising - carries
>90% cosine similarity to this user's own enrolled UP prototype).
Classifying from that first instant rejects real raises for looking
momentarily like noise or like a different enrolled direction before they
have committed.

GESTURE_ACTIVE (see ``TRAJECTORY_*`` constants and
``RightHandRaiseSession._advance_gesture_active``) therefore keeps feeding
the same ``PersonalizedMovementDetector`` after its first internal
acceptance, tracking the running peak angle-delta vector (still relative to
the frozen gesture-start baseline), until the peak stops growing for a
short, settled stretch (a real hold or the top of the motion), shows a real
sustained drop back down from that peak (stronger, faster evidence the
trajectory has peaked than waiting for a quiet hold), or a generous safety
cap elapses. Only that committed vector - "where the trajectory actually got
to" - is handed to direction classification.

Nearest personalized prototype, not a hardcoded axis-share cutoff
(``classify_trajectory``): when this user has a Face-ID directional
enrollment (``profile.json``'s ``accepted_directions``), a committed
trajectory is RIGHT_HAND_RAISE only when it is closer, by cosine similarity,
to this user's own enrolled UP than to any of their other enrolled
directions (including UP_RIGHT/UP_LEFT and, as competing prototypes only,
FORWARD/BACKWARD - kept in the comparison pool so a depth movement is not
awarded to UP merely for lacking a closer competing prototype, even though
depth itself stays untrusted for this gate). This directly fixes the
axis-share threshold's failure mode: UP_RIGHT's enrolled vector carries 49%
pitch share with the correct sign - comfortably over 0.35 - yet is trivially
closer (cosine 1.0 vs 0.75) to this user's own enrolled UP_RIGHT than to
their enrolled UP. Axis-share (``raise_alignment``) remains the fallback
only when no personalized enrollment exists yet for this user.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from statistics import median

try:
    from calibration_engine import (
        ANGLE_RESOLUTION_DEG,
        BaselineProfile,
        MotionSample,
        MovementResult,
        PersonalizedMovementDetector,
        cosine_similarity,
        vector_norm,
        wrapped_angle_delta,
    )
except ImportError:  # Support module execution from the repository root.
    from tools.witmotion_ble.calibration_engine import (
        ANGLE_RESOLUTION_DEG,
        BaselineProfile,
        MotionSample,
        MovementResult,
        PersonalizedMovementDetector,
        cosine_similarity,
        vector_norm,
        wrapped_angle_delta,
    )


ANGLE_AXIS_NAMES = ("roll_deg", "pitch_deg", "yaw_deg")

# See module docstring: a raise is real but not necessarily 3-axis-dominant
# once yaw drift accumulates. 0.35 keeps out near-noise movements while
# admitting real ones. Fallback only - see classify_trajectory.
RAISE_AXIS_SHARE_THRESHOLD = 0.35


def raise_alignment(vector: tuple[float, float, float], axis_index: int, sign: int) -> tuple[bool, float]:
    """Is this angle-delta vector a raise along the personalized raise axis?

    Returns (is_raise, axis_share), where axis_share is the raise axis's
    share of the combined |roll|+|pitch|+|yaw| magnitude (1.0 = purely that
    axis, kept for reporting/diagnostics even when not accepted).
    """
    magnitudes = [abs(component) for component in vector]
    total = sum(magnitudes)
    axis_share = magnitudes[axis_index] / total if total else 0.0
    correct_sign = sign * vector[axis_index] > 0
    return (correct_sign and axis_share >= RAISE_AXIS_SHARE_THRESHOLD), axis_share


# ---------------------------------------------------------------------------
# GESTURE_ACTIVE: trajectory extension + commit (unchanged layer - see
# module docstring). Preserved exactly as validated: do not retune these
# alongside the onset/rest redesign below.
# ---------------------------------------------------------------------------

TRAJECTORY_COMMIT_STALL_SAMPLES = 4
TRAJECTORY_PEAK_GROWTH_EPSILON_DEG = 0.05
TRAJECTORY_SETTLE_GYRO_MULTIPLIER = 3.0
TRAJECTORY_MAX_EXTENSION_S = 5.0
TRAJECTORY_DESCENT_DROP_FRACTION = 0.2
TRAJECTORY_DESCENT_CONFIRM_SAMPLES = 3

# Floor only, not the acceptance mechanism (see classify_trajectory): guards
# the degenerate case of a near-zero committed vector being awarded to
# whichever enrolled direction happens to be least-orthogonal to noise.
MIN_PROTOTYPE_COSINE = 0.3


def nearest_prototype(
    vector: tuple[float, float, float], prototypes: dict[str, tuple[float, float, float]]
) -> tuple[str, float, str | None, float | None]:
    """Rank this user's enrolled directions by cosine similarity to ``vector``.

    Returns (best_name, best_cosine, runner_up_name, runner_up_cosine).
    """
    scored = sorted(
        ((name, cosine_similarity(vector, proto)) for name, proto in prototypes.items()),
        key=lambda item: item[1],
        reverse=True,
    )
    best_name, best_cosine = scored[0]
    runner_name, runner_cosine = scored[1] if len(scored) > 1 else (None, None)
    return best_name, best_cosine, runner_name, runner_cosine


def classify_trajectory(
    vector: tuple[float, float, float],
    axis_index: int,
    sign: int,
    prototypes: dict[str, tuple[float, float, float]] | None,
    raise_direction_name: str = "up",
) -> tuple[bool, float, str | None, float | None, float | None]:
    """Is this committed trajectory vector RIGHT_HAND_RAISE?

    Returns (is_raise, raise_axis_share, nearest_prototype_name,
    nearest_prototype_cosine, runner_up_cosine). See module docstring.
    """
    axis_share_ok, axis_share = raise_alignment(vector, axis_index, sign)
    if not prototypes:
        return axis_share_ok, axis_share, None, None, None
    best_name, best_cosine, _, runner_cosine = nearest_prototype(vector, prototypes)
    is_raise = best_name == raise_direction_name and best_cosine >= MIN_PROTOTYPE_COSINE
    return is_raise, axis_share, best_name, best_cosine, runner_cosine


# ---------------------------------------------------------------------------
# IDLE: dynamic rest envelope + dual-path onset evidence (see module
# docstring's IDLE / ONSET sections)
# ---------------------------------------------------------------------------

# How much a single IDLE sample nudges the rest envelope's pose estimate.
# Deliberately small: this needs to absorb real drift over a multi-minute
# session without letting a handful of samples that turn out to belong to a
# genuine gesture's own run-up meaningfully corrupt it before onset evidence
# is confirmed (those leaked samples are also a small minority of any real
# session's mostly-idle time). 0.02 gives a ~50-sample (~5s at this
# session's ~10Hz rate) effective time constant.
IDLE_DRIFT_EMA_ALPHA = 0.02

# How often (in idle samples) to emit a development-only BASELINE_ADAPTED
# trace entry - purely for visibility, logging every single idle sample
# would be excessive for a multi-minute recording.
IDLE_DRIFT_LOG_INTERVAL = 25

# Dual-path onset evidence window and thresholds (see module docstring).
# FAST reuses PersonalizedMovementDetector's own onset multipliers (already
# validated, not new constants); SLOW reuses its displacement-valid
# multiplier for the same reason - this is evidence of what counts as a
# meaningful excursion for this user, not an independently invented number.
ONSET_EVIDENCE_WINDOW = 15  # ~1.5s at ~10Hz
ONSET_FAST_GYRO_MULTIPLIER = 3.5
ONSET_FAST_ACCEL_MULTIPLIER = 3.0
ONSET_FAST_CONSISTENT_SAMPLES = 2
ONSET_SLOW_DISPLACEMENT_NOISE_MULTIPLIER = 4.0
ONSET_SLOW_COHERENCE_MIN = 0.5
ONSET_SLOW_MIN_SAMPLES = 4


class OnsetEvidence:
    """Dual-path (fast/slow) intentional-motion evidence against the current rest envelope.

    This is what stands between raw per-sample noise and opening a gesture
    candidate. It does NOT decide direction (classify_trajectory's job,
    downstream, unchanged) - only whether there is enough accumulated
    evidence, over a short rolling window, that something intentional is
    starting, as opposed to ordinary rest drift/jitter that should instead
    feed the rest envelope's own slow adaptation (see IDLE_DRIFT_EMA_ALPHA).

    Buffers the raw (index, MotionSample) pairs too, so that once evidence
    fires the trajectory layer can be fed the movement's real run-up rather
    than only the one sample where accumulated evidence finally crossed the
    line (window_items()).
    """

    def __init__(self, rest: BaselineProfile, window_size: int = ONSET_EVIDENCE_WINDOW) -> None:
        self.rest = rest
        self._window: deque[tuple[int, MotionSample, tuple[float, float, float], float, float]] = deque(
            maxlen=window_size
        )

    def observe(self, index: int, sample: MotionSample) -> bool:
        angle_vector, gyro_vector, acceleration_vector = self.rest.deltas(sample)
        gyro_magnitude = vector_norm(gyro_vector)
        acceleration_magnitude = vector_norm(acceleration_vector)
        self._window.append((index, sample, angle_vector, gyro_magnitude, acceleration_magnitude))

        if len(self._window) >= ONSET_FAST_CONSISTENT_SAMPLES:
            recent = list(self._window)[-ONSET_FAST_CONSISTENT_SAMPLES:]
            if all(
                item[3] >= self.rest.gyro_noise_p95_dps * ONSET_FAST_GYRO_MULTIPLIER
                and item[4] >= self.rest.acceleration_noise_p95_g * ONSET_FAST_ACCEL_MULTIPLIER
                for item in recent
            ):
                return True

        if len(self._window) >= ONSET_SLOW_MIN_SAMPLES:
            vectors = [item[2] for item in self._window]
            net = vector_norm(tuple(vectors[-1][i] - vectors[0][i] for i in range(3)))
            path = sum(
                vector_norm(tuple(vectors[i + 1][j] - vectors[i][j] for j in range(3)))
                for i in range(len(vectors) - 1)
            )
            coherence = net / path if path > 1e-9 else 0.0
            displacement_threshold = self.rest.angle_noise_p95_deg * ONSET_SLOW_DISPLACEMENT_NOISE_MULTIPLIER
            if net >= displacement_threshold and coherence >= ONSET_SLOW_COHERENCE_MIN:
                return True

        return False

    def window_items(self) -> list[tuple[int, MotionSample]]:
        return [(item[0], item[1]) for item in self._window]


def _drift_rest_envelope(envelope: BaselineProfile, sample: MotionSample, alpha: float = IDLE_DRIFT_EMA_ALPHA) -> BaselineProfile:
    """Nudge the rest envelope's pose toward this sample; noise floor stays fixed."""
    new_angles = tuple(
        envelope.angles_deg[i] + alpha * wrapped_angle_delta(sample.angles_deg[i], envelope.angles_deg[i])
        for i in range(3)
    )
    return BaselineProfile(
        acceleration_g=envelope.acceleration_g,
        gyroscope_dps=envelope.gyroscope_dps,
        angles_deg=new_angles,
        angle_noise_p95_deg=envelope.angle_noise_p95_deg,
        gyro_noise_p95_dps=envelope.gyro_noise_p95_dps,
        acceleration_noise_p95_g=envelope.acceleration_noise_p95_g,
        sample_count=envelope.sample_count + 1,
    )


def _repose(pose_source: BaselineProfile, noise_source: BaselineProfile) -> BaselineProfile:
    """Combine a fresh pose estimate with a fixed, robust noise floor."""
    return BaselineProfile(
        acceleration_g=pose_source.acceleration_g,
        gyroscope_dps=pose_source.gyroscope_dps,
        angles_deg=pose_source.angles_deg,
        angle_noise_p95_deg=noise_source.angle_noise_p95_deg,
        gyro_noise_p95_dps=noise_source.gyro_noise_p95_dps,
        acceleration_noise_p95_g=noise_source.acceleration_noise_p95_g,
        sample_count=pose_source.sample_count,
    )


# ---------------------------------------------------------------------------
# SETTLING: has motion genuinely stopped, anywhere? (see module docstring's
# CRITICAL - REST MAY MOVE section)
# ---------------------------------------------------------------------------

# Reuses the same floor multipliers the previous NeutralRegionTest design
# used for its noise-floor-only case (small movements were always
# floor-dominated there anyway), but drops the peak-scaled term entirely -
# that term is what let a hold-then-descend cycle repeatedly reread as
# released mid-descent on large movements (see module docstring).
SETTLED_LOCAL_RADIUS_NOISE_MULTIPLIER = 5.0
SETTLED_GYRO_NOISE_MULTIPLIER = 2.5
SETTLED_WINDOW_SIZE = 10  # ~1s at ~10Hz

# The orthogonal axes (not the personalized raise axis) get more slack on
# their local radius, same reasoning NeutralRegionTest's own orthogonal
# multiplier used: natural repositioning, and in particular yaw's own
# gyro-integrated drift with no magnetometer correction (documented
# throughout this module and faceid_calibration.py as the least trustworthy
# axis), should not by itself block settling.
SETTLED_ORTHOGONAL_RADIUS_NOISE_MULTIPLIER = 12.0

# Upper bound on net/path coherence, evaluated on the RAISE AXIS ONLY
# (opposite sense from ONSET_SLOW_COHERENCE_MIN - here a HIGH value means
# "still trending", the thing settling must NOT be doing on the axis that
# actually needs to have stopped). Deliberately NOT evaluated isotropically
# across all three axes: yaw's own gyro-integration drift is itself
# persistently coherent even during genuine, fully at-rest stillness on the
# other two axes (verified: medium_raise_rep01.csv t=37.9-38.9s - pitch/roll
# rock-steady, gyro under 3dps throughout, yet yaw alone drifts ~3.4deg
# coherently in that same second from its own integration error) - an
# isotropic coherence check would never confirm settled during ordinary
# rest for this reason alone. 0.5 mirrors the same threshold OnsetEvidence
# uses to call something coherent in the first place.
SETTLED_MAX_COHERENCE = 0.5

# A brief pause at (or near) the top of a raise is real and common (this
# session's own protocols always include a deliberate ~1s hold before
# lowering) but is not, by itself, the wearer being "done" - the natural
# continuation is to keep lowering. Local radius + gyro + coherence alone
# cannot tell "paused mid-gesture" from "finished, settled here" apart
# (verified: very_small_raise_rep01.csv repetition 4's own post-commit hold
# was itself locally rock-steady for well over SETTLED_WINDOW_SIZE, so
# confirming settled the moment it looked locally quiet fixed the new rest
# at the RAISED pose, before the wearer had lowered at all - the genuine
# lowering that followed then read as a fresh, wrongly-classified onset).
# Requiring at least this fraction of real progress back from the
# committed movement's own peak - not a full return, "rest may move" is
# still honored - before SETTLING is even eligible to confirm directly
# targets that gap without reintroducing the old design's mistake (an
# unbounded, peak-scaled TOLERANCE band that a large movement could
# satisfy while still substantially elevated - see module docstring). This
# is a MINIMUM required progress, not a tolerance: smaller than this and
# settling simply keeps waiting, exactly as it already does for the
# coherence condition above.
SETTLED_MIN_PROGRESS_FROM_PEAK_FRACTION = 0.5

# Pathological safety net only: normal recovery is driven by observing an
# actual settled state, not a clock. This exists only so a recording that
# somehow never produces one (e.g. a disconnected sensor) cannot lock the
# detector up forever; any time it fires is recorded in the trace log as
# PATHOLOGICAL_BACKSTOP for visibility.
PATHOLOGICAL_BACKSTOP_S = 25.0


class SettledStateTest:
    """Has motion genuinely stopped - not necessarily back at the departure pose?

    Asks whether the last SETTLED_WINDOW_SIZE samples are themselves locally
    stable (clustered tightly around their OWN recent center - tight on the
    personalized raise axis, looser on the other two), quiet (low angular
    velocity), not still coherently trending on the raise axis, AND show at
    least SETTLED_MIN_PROGRESS_FROM_PEAK_FRACTION of real progress back from
    the committed movement's own peak (see that constant's comment) -
    independent of where the settled center ends up relative to the
    gesture's starting baseline, which need not be exactly recovered. The
    settled window's own mean pose becomes the new rest center once
    confirmed (see RightHandRaiseSession._confirm_new_rest). Angular
    velocity is read directly off the sensor's own gyroscope reading (not
    relative to any baseline) since it is already a rate, not a pose.
    """

    def __init__(
        self,
        noise_source: BaselineProfile,
        raise_axis_index: int,
        pregesture_baseline: BaselineProfile,
        peak_raise_axis_delta: float,
        window_size: int = SETTLED_WINDOW_SIZE,
    ) -> None:
        self.raise_axis_index = raise_axis_index
        self._raise_radius_tolerance = noise_source.angle_noise_p95_deg * SETTLED_LOCAL_RADIUS_NOISE_MULTIPLIER
        self._orthogonal_radius_tolerance = noise_source.angle_noise_p95_deg * SETTLED_ORTHOGONAL_RADIUS_NOISE_MULTIPLIER
        self._gyro_tolerance = noise_source.gyro_noise_p95_dps * SETTLED_GYRO_NOISE_MULTIPLIER
        self._pregesture_raise_pose = pregesture_baseline.angles_deg[raise_axis_index]
        self._max_progress_distance = abs(peak_raise_axis_delta) * (1.0 - SETTLED_MIN_PROGRESS_FROM_PEAK_FRACTION)
        self._recent: deque[tuple[MotionSample, float]] = deque(maxlen=window_size)

    def observe(self, sample: MotionSample, gyro_magnitude: float) -> bool:
        self._recent.append((sample, gyro_magnitude))
        if len(self._recent) < self._recent.maxlen:
            return False
        samples = [item[0] for item in self._recent]
        gyros = [item[1] for item in self._recent]
        axis = self.raise_axis_index
        raise_values = [s.angles_deg[axis] for s in samples]
        raise_center = median(raise_values)
        raise_radius = max(abs(wrapped_angle_delta(value, raise_center)) for value in raise_values)

        orthogonal_center = tuple(median(s.angles_deg[i] for s in samples) for i in range(3) if i != axis)
        orthogonal_axes = [i for i in range(3) if i != axis]
        orthogonal_radius = max(
            vector_norm(
                tuple(wrapped_angle_delta(s.angles_deg[i], orthogonal_center[k]) for k, i in enumerate(orthogonal_axes))
            )
            for s in samples
        )

        raise_net = wrapped_angle_delta(raise_values[-1], raise_values[0])
        raise_path = sum(abs(wrapped_angle_delta(raise_values[i + 1], raise_values[i])) for i in range(len(raise_values) - 1))
        raise_coherence = abs(raise_net) / raise_path if raise_path > 1e-9 else 0.0

        distance_from_pregesture = abs(wrapped_angle_delta(raise_center, self._pregesture_raise_pose))
        progressed_enough = distance_from_pregesture <= max(self._raise_radius_tolerance, self._max_progress_distance)

        return (
            raise_radius <= self._raise_radius_tolerance
            and orthogonal_radius <= self._orthogonal_radius_tolerance
            and median(gyros) <= self._gyro_tolerance
            and raise_coherence <= SETTLED_MAX_COHERENCE
            and progressed_enough
        )

    @property
    def rest_samples(self) -> list[MotionSample]:
        return [item[0] for item in self._recent]


@dataclass(frozen=True, slots=True)
class RightHandRaiseEvent:
    sample_index: int
    timestamp: float
    movement: MovementResult
    raise_axis_share: float
    nearest_prototype: str | None = None
    nearest_prototype_cosine: float | None = None
    runner_up_cosine: float | None = None


@dataclass(frozen=True, slots=True)
class RejectedMovement:
    """A detected movement that did not match the personalized raise direction."""

    sample_index: int
    timestamp: float
    movement: MovementResult
    raise_axis_share: float
    nearest_prototype: str | None = None
    nearest_prototype_cosine: float | None = None
    runner_up_cosine: float | None = None


@dataclass(frozen=True, slots=True)
class TraceEvent:
    """One state-machine transition, for development-only replay tracing.

    Not used by any production path - see replay_gate.py's --trace flag.
    """

    sample_index: int
    timestamp: float
    previous_state: str
    new_state: str
    reason: str
    distance_from_baseline_deg: float
    dominant_axis_delta_deg: float
    gyro_dps: float
    baseline_pose_deg: tuple[float, float, float]


class RightHandRaiseSession:
    """Streaming RIGHT_HAND_RAISE detector for one continuous telemetry feed.

    Construct once per physical session (i.e. once per game session in
    production, once per replayed recording in the offline gate) and call
    ``observe`` once per incoming sample in order. See module docstring for
    the full IDLE -> GESTURE_ACTIVE -> SETTLING -> IDLE design.
    """

    def __init__(
        self,
        baseline: BaselineProfile,
        raise_axis_index: int,
        raise_sign: int,
        directional_prototypes: dict[str, tuple[float, float, float]] | None = None,
        raise_direction_name: str = "up",
        trace: list[TraceEvent] | None = None,
    ) -> None:
        self.rest_envelope = baseline
        self._noise_floor = baseline  # fixed noise-floor source; pose is free to drift
        self.raise_axis_index = raise_axis_index
        self.raise_sign = raise_sign
        self.directional_prototypes = directional_prototypes
        self.raise_direction_name = raise_direction_name
        self.trace = trace  # append-only if provided; None disables tracing (production path)
        self.state = "IDLE"
        self.events: list[RightHandRaiseEvent] = []
        self.rejected_movements: list[RejectedMovement] = []
        self.rearm_count = 0
        self.pathological_backstop_count = 0
        self.rebaseline_count = 0

        # The reference pose currently in effect for classification/tracing:
        # == rest_envelope while IDLE; a frozen snapshot of it, taken the
        # instant onset evidence fired, throughout GESTURE_ACTIVE/SETTLING.
        self.baseline = baseline

        self._onset_evidence = OnsetEvidence(self.rest_envelope)
        self._active_detector: PersonalizedMovementDetector | None = None
        self._extension_started_at: float | None = None
        self._extension_peak_seen = 0.0
        self._extension_stall = 0
        self._extension_descent_run = 0
        self._provisional_detection_path = ""

        self._settled_test: SettledStateTest | None = None
        self._settling_started_at: float | None = None

        self._idle_sample_count = 0

    def _log(self, index: int, timestamp: float, previous: str, new: str, reason: str, distance: float, dominant_delta: float, gyro: float) -> None:
        if self.trace is None:
            return
        self.trace.append(
            TraceEvent(
                sample_index=index,
                timestamp=timestamp,
                previous_state=previous,
                new_state=new,
                reason=reason,
                distance_from_baseline_deg=distance,
                dominant_axis_delta_deg=dominant_delta,
                gyro_dps=gyro,
                baseline_pose_deg=self.baseline.angles_deg,
            )
        )

    def observe(self, index: int, sample: MotionSample) -> RightHandRaiseEvent | None:
        if self.state == "SETTLING":
            return self._advance_settling(index, sample)
        if self.state == "GESTURE_ACTIVE":
            return self._advance_gesture_active(index, sample)
        return self._advance_idle(index, sample)

    def _advance_idle(self, index: int, sample: MotionSample) -> RightHandRaiseEvent | None:
        if not self._onset_evidence.observe(index, sample):
            self.rest_envelope = _drift_rest_envelope(self.rest_envelope, sample)
            self.baseline = self.rest_envelope
            self._idle_sample_count += 1
            if self.trace is not None and self._idle_sample_count % IDLE_DRIFT_LOG_INTERVAL == 0:
                self._log(
                    index, sample.timestamp, "IDLE", "IDLE",
                    "REST_DRIFT_ACCEPTED (BASELINE_ADAPTED)", 0.0, 0.0, vector_norm(sample.gyroscope_dps),
                )
            return None

        return self._begin_gesture_active(index, sample, self.rest_envelope, self._onset_evidence.window_items(), "IDLE")

    def _begin_gesture_active(
        self, index: int, sample: MotionSample, baseline: BaselineProfile,
        window_items: list[tuple[int, MotionSample]], previous: str,
    ) -> RightHandRaiseEvent | None:
        """Freeze ``baseline`` as this gesture's reference and replay the onset-evidence
        window's own buffered samples into a fresh detector, so the trajectory layer sees
        the movement's real run-up (see module docstring / OnsetEvidence). Callable both
        from IDLE and, when new onset evidence interrupts an in-progress SETTLING, from
        there too (see _advance_settling).
        """
        self.state = "GESTURE_ACTIVE"
        self.baseline = baseline
        self._active_detector = PersonalizedMovementDetector(self.baseline, window_items[0][1].timestamp)
        self._extension_started_at = window_items[0][1].timestamp
        self._extension_peak_seen = 0.0
        self._extension_stall = 0
        self._extension_descent_run = 0
        self._provisional_detection_path = ""
        self._log(
            index, sample.timestamp, previous, "GESTURE_ACTIVE",
            "INTENTIONAL_ONSET", 0.0, 0.0, vector_norm(sample.gyroscope_dps),
        )

        result: RightHandRaiseEvent | None = None
        for buffered_index, buffered_sample in window_items:
            result = self._advance_gesture_active(buffered_index, buffered_sample)
            if self.state != "GESTURE_ACTIVE":
                break
        return result

    def _advance_gesture_active(self, index: int, sample: MotionSample) -> RightHandRaiseEvent | None:
        """Extend a candidate until its trajectory commits (unchanged layer - see module docstring)."""
        detector = self._active_detector
        assert detector is not None and self._extension_started_at is not None
        result = detector.observe(sample)
        if result is not None and not self._provisional_detection_path:
            self._provisional_detection_path = result.detection_path

        if detector.peak_angle > self._extension_peak_seen + TRAJECTORY_PEAK_GROWTH_EPSILON_DEG:
            self._extension_peak_seen = detector.peak_angle
            self._extension_stall = 0
        else:
            self._extension_stall += 1

        current_angle = vector_norm(self.baseline.deltas(sample)[0])
        if detector.peak_angle > 0 and current_angle <= detector.peak_angle * (1.0 - TRAJECTORY_DESCENT_DROP_FRACTION):
            self._extension_descent_run += 1
        else:
            self._extension_descent_run = 0

        gyro_now = vector_norm(self.baseline.deltas(sample)[1])
        settled = gyro_now <= self.baseline.gyro_noise_p95_dps * TRAJECTORY_SETTLE_GYRO_MULTIPLIER
        elapsed = sample.timestamp - self._extension_started_at

        stalled_and_settled = self._extension_stall >= TRAJECTORY_COMMIT_STALL_SAMPLES and settled
        descent_confirmed = self._extension_descent_run >= TRAJECTORY_DESCENT_CONFIRM_SAMPLES
        max_extended = elapsed >= TRAJECTORY_MAX_EXTENSION_S

        # Guards the replay of the onset-evidence window's own leading
        # (still-quiet) samples: the detector may not have opened its own
        # internal candidate yet even though OnsetEvidence already has.
        if detector.candidate_started_at is None:
            return None
        if not (stalled_and_settled or descent_confirmed or max_extended):
            return None

        if descent_confirmed and not stalled_and_settled:
            commit_reason = "TRAJECTORY_DESCENT_CONFIRMED"
        elif max_extended and not (stalled_and_settled or descent_confirmed):
            commit_reason = "TRAJECTORY_MAX_EXTENSION"
        else:
            commit_reason = "TRAJECTORY_SETTLED"

        committed = MovementResult(
            accepted_at=sample.timestamp,
            detection_latency_s=sample.timestamp - detector.shown_at,
            duration_s=elapsed,
            peak_angle_delta_deg=detector.peak_angle,
            peak_gyro_dps=detector.peak_gyro,
            peak_acceleration_delta_g=detector.peak_acceleration,
            angle_vector_deg=detector.peak_angle_vector,
            acceleration_vector_g=detector.peak_acceleration_vector,
            angular_path_deg=detector.angular_path,
            direction_coherence=detector.peak_angle / max(detector.angular_path, detector.peak_angle, ANGLE_RESOLUTION_DEG),
            detection_path=self._provisional_detection_path or "trajectory_committed",
        )

        is_raise, axis_share, proto_name, proto_cosine, runner_cosine = classify_trajectory(
            committed.angle_vector_deg,
            self.raise_axis_index,
            self.raise_sign,
            self.directional_prototypes,
            self.raise_direction_name,
        )
        dominant_delta = committed.angle_vector_deg[self.raise_axis_index]
        self._settled_test = SettledStateTest(
            self._noise_floor, self.raise_axis_index, self.baseline, committed.angle_vector_deg[self.raise_axis_index],
        )
        self._settling_started_at = sample.timestamp
        previous = self.state
        self.state = "SETTLING"

        proto_note = f", nearest={proto_name} (cos={proto_cosine:.2f} vs runner-up {runner_cosine:.2f})" if proto_name else ""
        if is_raise:
            event = RightHandRaiseEvent(index, sample.timestamp, committed, axis_share, proto_name, proto_cosine, runner_cosine)
            self.events.append(event)
            self._log(index, sample.timestamp, previous, "SETTLING", f"TRIGGERED: RIGHT_HAND_RAISE accepted ({commit_reason}{proto_note})", 0.0, dominant_delta, committed.peak_gyro_dps)
            return event

        self.rejected_movements.append(RejectedMovement(index, sample.timestamp, committed, axis_share, proto_name, proto_cosine, runner_cosine))
        self._log(
            index, sample.timestamp, previous, "SETTLING",
            f"TRIGGERED: movement rejected ({commit_reason}, axis_share={axis_share:.2f}{proto_note})",
            0.0, dominant_delta, committed.peak_gyro_dps,
        )
        return None

    def _advance_settling(self, index: int, sample: MotionSample) -> RightHandRaiseEvent | None:
        assert self._settled_test is not None and self._settling_started_at is not None
        gyro_magnitude = vector_norm(sample.gyroscope_dps)
        confirmed = self._settled_test.observe(sample, gyro_magnitude)
        elapsed = sample.timestamp - self._settling_started_at
        if confirmed:
            self._confirm_new_rest(index, sample, self._settled_test.rest_samples)
        elif elapsed > PATHOLOGICAL_BACKSTOP_S:
            self.pathological_backstop_count += 1
            self._log(
                index, sample.timestamp, "SETTLING", "SETTLING",
                "PATHOLOGICAL_BACKSTOP: no settled state within safety limit", 0.0, 0.0, gyro_magnitude,
            )
            # Keep waiting for a genuine settled state rather than force-
            # rearming blind; just stop counting this attempt against the
            # same start time so the log does not spam every sample.
            self._settling_started_at = sample.timestamp
        return None

    def _confirm_new_rest(self, index: int, sample: MotionSample, settled_samples: list[MotionSample]) -> None:
        self.rest_envelope = _repose(BaselineProfile.from_samples(settled_samples), self._noise_floor)
        self.baseline = self.rest_envelope
        self._onset_evidence = OnsetEvidence(self.rest_envelope)
        previous = self.state
        self.state = "IDLE"
        self._settled_test = None
        self._settling_started_at = None
        self._active_detector = None
        self.rearm_count += 1
        self.rebaseline_count += 1
        self._idle_sample_count = 0
        self._log(index, sample.timestamp, previous, "IDLE", "NEW_REST_CONFIRMED", 0.0, 0.0, 0.0)

    def observe_all(self, samples: list[MotionSample]) -> list[RightHandRaiseEvent]:
        for index, sample in enumerate(samples):
            self.observe(index, sample)
        return self.events
