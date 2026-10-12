/** Static build-time switch. Untagged historical/live records always use the legacy renderer. */
export const WONDER_DOME_ENABLED = process.env.NEXT_PUBLIC_BUBBLE_POP_WALL_3D !== '0';
