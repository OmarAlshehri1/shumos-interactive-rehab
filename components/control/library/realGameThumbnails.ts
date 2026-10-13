import type {GameId} from '@/lib/games/registry';
import {LEGACY_BALLOON_QUEST} from '@/lib/balloonquest/rollback';
import {FOOTSTEPS_3D_ENABLED} from '@/lib/footsteps3d/registration';
import {COLOR_CHASE_3D_ENABLED} from '@/lib/colorchase3d/registration';
import {SPACE_PILOT_3D_ENABLED} from '@/lib/spacepilot3d/releasePolicy';
import {WONDER_DOME_ENABLED} from '@/lib/bubblepopwall3d/releasePolicy';
/** Actual local Display captures, cropped to 16:9; provenance lives in docs/release/library-evidence. */
export const REAL_GAME_THUMBNAILS: Partial<Record<GameId,string>> = {
 'balance-bridge-3d':'/balancebridge3d/thumbnail.webp',
 'shumos-castle-legends-3d':'/castlelegends3d/thumbnail.png',
 'balloon-quest':'/library-thumbnails/balloon-quest.webp',
 'follow-the-footsteps':'/library-thumbnails/follow-the-footsteps.webp',
 'bubble-pop-wall':'/library-thumbnails/bubble-pop-wall.webp',
 'space-pilot':'/library-thumbnails/space-pilot.webp',
 'color-chase':'/library-thumbnails/color-chase.webp',
 'build-quest-3d':'/library-thumbnails/build-quest-3d.webp',
 'runner-quest-3d':'/library-thumbnails/runner-quest-3d.webp',
 'mirror-quest-3d':'/library-thumbnails/mirror-quest-3d.webp',
 'safe-hex-arena-3d':'/library-thumbnails/safe-hex-arena-3d.webp',
 'turn-and-go-3d':'/library-thumbnails/turn-and-go-3d.webp',
 'rhythm-steps-3d':'/library-thumbnails/rhythm-steps-3d.webp',
 'body-sequence-3d':'/library-thumbnails/body-sequence-3d.webp',
 'achievement-city-3d':'/library-thumbnails/achievement-city-3d.webp',
 'ocean-wonders-3d':'/library-thumbnails/ocean-wonders-3d.webp',
 'fire-rescue-3d':'/library-thumbnails/fire-rescue-3d.webp',
 'blooming-world-3d':'/library-thumbnails/blooming-world-3d.webp',
 'harvest-valley-3d':'/library-thumbnails/harvest-valley-3d.webp',
 'pearl-voyage-3d':'/library-thumbnails/pearl-voyage-3d.webp',
 'foot-maze-3d':'/library-thumbnails/foot-maze-3d.webp',
};
/** Rollbacks retain their safe original artwork rather than showing a different engine's scene. */
export function realGameThumbnail(id:GameId):string|undefined {
 if(id==='balloon-quest'&&LEGACY_BALLOON_QUEST||id==='follow-the-footsteps'&&!FOOTSTEPS_3D_ENABLED||id==='color-chase'&&!COLOR_CHASE_3D_ENABLED||id==='space-pilot'&&!SPACE_PILOT_3D_ENABLED||id==='bubble-pop-wall'&&!WONDER_DOME_ENABLED)return undefined;
 return REAL_GAME_THUMBNAILS[id];
}
