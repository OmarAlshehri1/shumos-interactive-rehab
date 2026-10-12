import { DEFAULT_CONFIG } from '../config';
import { planStage as plan } from '../engine';

export const STAGES_FOR_TEST = 9;
export const planStage = (stage: number) => plan(stage, 5, 1, DEFAULT_CONFIG);
