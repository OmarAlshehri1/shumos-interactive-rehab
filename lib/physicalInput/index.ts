/**
 * Physical hardware input architecture (WT901BLECL and beyond). The
 * RIGHT_HAND continuous-pointer path is wired in: SensorRuntimeProvider
 * (components/control/sensors/SensorRuntimeProvider.tsx, mounted at
 * app/control/layout.tsx) owns one shared connection across every
 * /control/* route, and useSensorPointerTargets/useContactTargets
 * (components/control/sensors/useSensorPointerTargets.ts) adapt its
 * pointer stream into each compatible game's own existing canonical
 * action — see the *SensorContactDemo.tsx components for the five games
 * currently wired (Balloon Quest, Follow the Footsteps,
 * Bubble Pop Wall, Color Chase). Discrete semantic-gesture detection
 * (SemanticDetector/onEvent) remains unused by any of them.
 */
export * from "./types";
export * from "./InputSource";
export * from "./SemanticDetector";
export * from "./PhysicalInputManager";
export * from "./SimulatedInputSource";
export * from "./roleAssignment";
export * from "./calibrationProfile";
export * from "./ContinuousMotionController";
export * from "./MotionFilters";
export * from "./MotionDiagnostic";
export * from "./ContactActivationGate";
export * from "./SensorContactRouter";
export * from "./WitmotionBleProtocol";
export * from "./Wt901BleInputSource";
export * from "./WitmotionRateTest";
export * from "./WitmotionConfigTrial";
export * from "./FinalSessionPhases";
export * from "./RightHandSessionProfile";
export * from "./StabilizationProfiles";
export * from "./TwistInvarianceCapturePhases";
export * from "./SensorHandRuntimeConfig";
export * from "./LeftHandEnrollmentPhases";
export * from "./LeftHandEnrollmentProfile";
