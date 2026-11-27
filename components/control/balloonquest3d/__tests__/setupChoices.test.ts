import {expect,it} from 'vitest';
import {SIZE_OPTIONS,SPEED_OPTIONS} from '../BalloonQuest3DControl';
import {resolveStage} from '@/lib/balloonquest/stages';
import {DEFAULT_SETTINGS} from '@/lib/balloonquest/types';
it('offers exactly three Arabic size choices that change the real native balloon diameter',()=>{
 expect(SIZE_OPTIONS.map(([,label])=>label)).toEqual(['صغير','متوسط','كبير']);
 const sizes=SIZE_OPTIONS.map(([sizeScale])=>resolveStage(3,{...DEFAULT_SETTINGS,sizeScale}).sizeCqh);expect(sizes[0]).toBeLessThan(sizes[1]);expect(sizes[1]).toBeLessThan(sizes[2]);
});
it('offers exactly three Arabic rise speeds that change native travel time without changing scoring goals',()=>{
 expect(SPEED_OPTIONS.map(([,label])=>label)).toEqual(['بطيء','متوسط','سريع']);
 const stages=SPEED_OPTIONS.map(([speedScale])=>resolveStage(3,{...DEFAULT_SETTINGS,speedScale}));expect(stages[0].riseSeconds).toBeGreaterThan(stages[1].riseSeconds);expect(stages[1].riseSeconds).toBeGreaterThan(stages[2].riseSeconds);expect(new Set(stages.map(s=>s.goal)).size).toBe(1);
});
