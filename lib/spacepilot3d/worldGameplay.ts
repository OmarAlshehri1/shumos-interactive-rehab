import {CURRICULUM_ENCOUNTERS, SPACE_STAGES, curriculumIndex, type CurriculumId, type StageResult} from './curriculum';
import { flightModeForStage, normalizeAccessibility, openingRadius, ringCrossing, type AccessibilitySettings } from './rings';
import { pointerForHeading } from './worldFlight';
import { DIFFICULTY_PRESETS, MISSION_PLANS, normalizeGameplayConfig, type GameplayConfig } from './missions';
import type { EncounterOutcome, GameplayEvent, GameplayObject, GameplaySnapshot, GameplayStats, GameplayStatus } from './gameplay';
import type { NormalizedFlightInput } from './simulation';
import { advanceFlight, courseAt, FLIGHT_STEP, initialFlightPose, normalizeFlightSettings, type FlightSettings } from './worldFlight';
import { sweptWorldIntersection } from './worldCollision';

export const WORLD_VISIBLE_DISTANCE = 260;
export interface WorldGameplayConfig extends GameplayConfig { flightSettings: FlightSettings; accessibility: AccessibilitySettings }
type Options = Partial<GameplayConfig> & { curriculumId?:CurriculumId; sessionId?: string; flightSettings?: Partial<FlightSettings>; accessibility?: Partial<AccessibilitySettings> };

/** R1 migration boundary. The earlier lane simulator stays unchanged for historical
 * tests/previews. Only this world simulator is instantiated by paired Control.
 * +X right, +Y up, -Z course-forward. Encounters have immutable world positions.
 */
export class WorldGameplaySimulation {
  readonly sessionId: string;
  runId = 1;
  config: WorldGameplayConfig;
  status: GameplayStatus = 'ready';
  mission = 0;
  readonly curriculumId?:CurriculumId;
  readonly stageResults:StageResult[]=[];
  readonly repeats:number[]=Array(9).fill(0);
  startingStageIndex=0;
  private assisted=false;
  elapsedSeconds = 0;
  missionSeconds = 0;
  revision = 0;
  readonly ship = initialFlightPose();
  readonly objects: GameplayObject[] = [];
  readonly events: GameplayEvent[] = [];
  readonly stats: GameplayStats = { ringsPresented: 0, ringsCollected: 0, ringsMissed: 0, asteroidsPresented: 0, asteroidsAvoided: 0, asteroidCollisions: 0, score: 0, collectionAccuracy: null, upgradeTier: 1, resolved: 0, totalEncounters: 18, completedMissions: 0 };
  private accumulator = 0;
  private readonly before = initialFlightPose();
  constructor(options: Options = {}) {
    this.curriculumId=options.curriculumId;
    this.sessionId = options.sessionId ?? 'local-world-flight';
    const config = normalizeGameplayConfig({...options,...(this.curriculumId?{speed:9}:{})});
    this.config = { ...config, flightSettings: normalizeFlightSettings(options.flightSettings, config.difficulty), accessibility: normalizeAccessibility(options.accessibility,config.difficulty) };
    if(this.curriculumId)this.stats.totalEncounters=CURRICULUM_ENCOUNTERS;
    this.loadMission();
  }
  get currentStageAssisted(){return this.assisted;}
  restoreStageAssistance(assisted:boolean){this.assisted=assisted;}
  noteManualParticipation(){if(!this.assisted){this.assisted=true;this.revision++;}}
  get plan() { return this.curriculumId?SPACE_STAGES[this.mission]:MISSION_PLANS[this.mission]; }
  get missionName() { return this.plan.name; }
  get speed() { return this.config.speed * 2.5 * (this.config.accessibility.mode === 'EASY' ? .75 : 1); }
  start() { if (this.status === 'ready') { if(this.curriculumId&&this.elapsedSeconds===0)this.startingStageIndex=this.mission; this.status = 'running'; this.revision++; } }
  pause() { if (this.status === 'running') { this.status = 'paused'; this.accumulator = 0; this.revision++; } }
  resume() { if (this.status === 'paused') { this.status = 'running'; this.accumulator = 0; this.revision++; } }
  invalidateInput() { this.accumulator = 0; }
  nextMission(expectedRunId = this.runId) {
    if (expectedRunId !== this.runId || this.status !== 'mission-complete') return;
    this.mission=this.curriculumId?this.nextUnresolved():this.mission+1; this.missionSeconds = 0; this.accumulator = 0;
    // Preserve world position and orientation; no warp between regions.
    this.loadMission(); this.status = 'running'; this.revision++;
  }
  restart(patch: Options = {}, expectedRunId = this.runId) {
    if (expectedRunId !== this.runId) return;
    const changedDifficulty = patch.difficulty && patch.difficulty !== this.config.difficulty;
    const config = normalizeGameplayConfig({ ...(changedDifficulty ? DIFFICULTY_PRESETS[patch.difficulty!] : this.config), ...patch,...(this.curriculumId?{speed:9}:{}) });
    this.config = { ...config, flightSettings: normalizeFlightSettings(patch.flightSettings ?? (changedDifficulty ? undefined : this.config.flightSettings), config.difficulty), accessibility: normalizeAccessibility({...this.config.accessibility, ...(changedDifficulty?{ringTolerance:undefined}:{}), ...patch.accessibility},config.difficulty) };
    this.runId++; this.mission = 0; this.elapsedSeconds = this.missionSeconds = this.accumulator = 0;
    Object.assign(this.ship, initialFlightPose()); this.events.length = 0;this.stageResults.length=0;this.repeats.fill(0);this.startingStageIndex=0;
    Object.assign(this.stats, { ringsPresented: 0, ringsCollected: 0, ringsMissed: 0, asteroidsPresented: 0, asteroidsAvoided: 0, asteroidCollisions: 0, score: 0, collectionAccuracy: null, upgradeTier: 1, resolved: 0, completedMissions: 0 });
    this.loadMission(); this.status = 'running'; this.revision++;
  }
  private loadMission() {
    if(this.curriculumId)this.config.accessibility.mode=flightModeForStage(this.mission);
    this.objects.length = 0;
    this.assisted=this.config.accessibility.mode!=='ADVANCED'||this.config.accessibility.ringTolerance>0;
    if(this.curriculumId)this.config.difficulty=SPACE_STAGES[this.mission].difficulty;
    const s = this.config.flightSettings, a=this.config.accessibility, spacing=Math.max(s.encounterSpacing,a.mode==='EASY'?6:4), rate = s.maxTurnRate * Math.PI / 180;
    // Conservative spread scales with the available movement range and turning
    // budget. Extreme accessibility settings cannot create unreachable targets.
    const width = Math.min(s.horizontalLimit * .35, this.speed * Math.sin(Math.min(s.headingLimit*Math.PI/180, .4 * s.sensitivity)) * Math.max(.5, spacing - .8 / rate) * .31);
    const height = Math.min(s.verticalLimit * .28, this.speed * Math.sin(Math.min(.3, .2 * s.sensitivity)) * Math.max(.5, spacing - .4 / (rate * .7)) * .3);
    const approach = Math.max(90, this.speed * 4);
    const anchorX = this.ship.x-courseAt(this.ship.z,s).x, anchorY=this.ship.y;
    // Start the next region near the actual arrival offset, then gradually lay
    // objectives back toward the configured course. No spacecraft auto-steering.
    const returnOffset=(offset:number,budget:number,index:number)=>Math.sign(offset)*Math.max(0,Math.abs(offset)-budget*index);
    const bound = (value: number, limit: number, margin: number) => Math.max(-limit + margin, Math.min(limit - margin, value));
    for (const [i, layout] of this.plan.encounters.entries()) {
      const retainedHazard = this.config.difficulty==='HIGH' || (this.config.difficulty==='MEDIUM' ? i!==3 : this.mission===0 || i===5);
      let kind = layout.kind!=='ring'&&!retainedHazard?'ring':layout.kind;
      if(a.mode==='EASY' && kind==='fiery' && i!==5)kind='asteroid';
      if(a.mode!=='EASY' && this.config.difficulty==='HIGH' && this.mission>0 && kind==='asteroid')kind='fiery';
      const scale = layout.scale * (kind === 'ring' ? 2 : 2.3);
      const depth = approach + i * this.speed * spacing;
      const course = courseAt(this.ship.z-depth,s);
      const object: GameplayObject = { ...layout, kind, scale, x: course.x + bound(returnOffset(anchorX,width*.6,i) + layout.x / 3.5 * width, s.horizontalLimit, 8), y: bound(returnOffset(anchorY,height*.6,i) + layout.y / 1.6 * height, s.verticalLimit, 5), z: this.ship.z - depth, id: `mission-${this.mission+1}-object-${i+1}`, arrivalSeconds: depth / this.speed, radius: kind === 'ring' ? scale * .46 + this.config.targetTolerance : scale * 1.08, presented: false, outcome: 'pending' };
      if(kind==='ring'){
        if(a.mode==='EASY')object.y=0;
        const pitch=a.mode==='ADVANCED'?layout.y*.045:0;
        object.ring={innerRadius:openingRadius(a),normal:{x:-Math.sin(course.yaw)*Math.cos(pitch),y:Math.sin(pitch),z:Math.cos(course.yaw)*Math.cos(pitch)}};
        object.radius=object.ring.innerRadius+.45;
      }else if(a.mode!=='ADVANCED'){
        // Assisted/easy routes are altitude-safe by construction. Hazards are
        // staggered horizontally, with at least one ring between hazard planes.
        object.y=0;
        object.x=course.x+bound(returnOffset(anchorX,width*.6,i)+(i%2?-1:1)*Math.max(6,width*.8),s.horizontalLimit,8);
      }
      this.objects.push(object);
    }
  }
  step(delta: number, input: NormalizedFlightInput | null, expectedRunId = this.runId) {
    if (expectedRunId !== this.runId || this.status !== 'running' || !Number.isFinite(delta) || delta <= 0) return;
    if (delta > .25 || !input || !Number.isFinite(input.x) || !Number.isFinite(input.y)) { this.pause(); return; }
    // Store accepted steering immediately for pickup/keyboard seeding, even on
    // render intervals smaller than one physical step. No signal smoothing.
    this.ship.controlX = Math.min(1, Math.max(0, input.x)); this.ship.controlY = Math.min(1, Math.max(0, input.y));
    this.accumulator += delta;
    while (this.accumulator + 1e-10 >= FLIGHT_STEP && this.status === 'running') {
      this.accumulator -= FLIGHT_STEP;
      Object.assign(this.before, this.ship);
      const a=this.config.accessibility;
      let effective=input;
      if(a.mode==='EASY')effective={x:input.x,y:.5};
      else if(a.mode==='MEDIUM'){
        const upcoming=this.objects.find(o=>o.outcome==='pending');
        const target=upcoming?.kind==='ring'&&this.ship.z>upcoming.z?upcoming:undefined;
        // Altitude only, bounded speed and physical pitch response. Never touch
        // horizontal steering or the accepted pointer used by recovery guards.
        const seconds=target?Math.max(1,(this.ship.z-target.z)/this.speed):1;
        const vy=target?Math.max(-a.altitudeAssistance,Math.min(a.altitudeAssistance,(target.y-this.ship.y)/seconds)):0;
        effective={x:input.x,y:pointerForHeading(0,Math.asin(vy/this.speed),this.config.flightSettings.sensitivity).y};
      }
      advanceFlight(this.ship, effective, this.config.flightSettings, this.speed, FLIGHT_STEP);
      this.ship.controlX=Math.max(0,Math.min(1,input.x));this.ship.controlY=Math.max(0,Math.min(1,input.y));
      this.missionSeconds += FLIGHT_STEP; this.elapsedSeconds += FLIGHT_STEP;
      for (const object of this.objects) {
        if (object.outcome !== 'pending') continue;
        const depth = this.ship.z - object.z;
        if (!object.presented && depth <= WORLD_VISIBLE_DISTANCE) {
          object.presented = true;
          if (object.kind === 'ring') this.stats.ringsPresented++; else this.stats.asteroidsPresented++;
          this.updateAccuracy(); this.revision++;
        }
        if (!object.presented) continue;
        if(object.kind==='ring'&&object.ring){
          const crossing=ringCrossing({...object,...object.ring},this.before,this.ship);
          if(crossing)this.resolve(object,crossing);
          else if(depth < -object.radius-4)this.resolve(object,'missed');
        }else if (sweptWorldIntersection(object, object.radius, this.before, this.ship)) this.resolve(object, 'collision');
        else if (depth < -3 - object.radius) this.resolve(object, 'avoided');
      }
      if (this.objects.every(object => object.outcome !== 'pending')) {
        if(this.curriculumId){this.acceptStage('completed');this.status=this.stageResults.length===9?'complete':'mission-complete';}else {this.stats.completedMissions++;this.status=this.mission===2?'complete':'mission-complete';} this.accumulator = 0; this.revision++;
      }
    }
  }
  private nextUnresolved(){for(let n=1;n<=9;n++){const index=(this.mission+n)%9;if(!this.stageResults.some(r=>r.stageIndex===index))return index;}return this.mission;}
  private acceptStage(status:'completed'|'skipped'){
    const objects=this.objects, count=(outcome:string)=>objects.filter(o=>o.outcome===outcome).length;
    const result:StageResult={stageIndex:this.mission,status,assisted:this.assisted,durationMs:Math.round(this.missionSeconds*1000),ringsPresented:objects.filter(o=>o.kind==='ring'&&o.presented).length,ringsCollected:count('collected'),ringsMissed:count('missed'),asteroidsPresented:objects.filter(o=>o.kind!=='ring'&&o.presented).length,asteroidsAvoided:count('avoided'),asteroidCollisions:count('collision'),repeats:this.repeats[this.mission]};
    const old=this.stageResults.findIndex(r=>r.stageIndex===this.mission);if(old>=0)this.stageResults.splice(old,1);this.stageResults.push(result);
    this.stats.completedMissions=this.stageResults.filter(r=>r.status==='completed').length;
  }
  /** Replays replace that stage's accepted attempt; other stages and elapsed time survive. */
  selectStage(index:number,repeat=false){
    if(!this.curriculumId||!curriculumIndex(index)||this.status==='complete')return false;
    this.stageResults.splice(0,this.stageResults.length,...this.stageResults.filter(r=>r.stageIndex!==index));
    const discard=new Set([index]);if(!this.stageResults.some(r=>r.stageIndex===this.mission))discard.add(this.mission);
    this.events.splice(0,this.events.length,...this.events.filter(e=>!discard.has(e.mission)));

    if(repeat)this.repeats[index]++;
    this.mission=index;this.missionSeconds=0;this.accumulator=0;Object.assign(this.ship,initialFlightPose());
    // Only retained accepted outcomes contribute to score; current discarded attempts do not.
    const count=(kind:string)=>this.events.filter(e=>e.outcome===kind).length;
    Object.assign(this.stats,{ringsCollected:count('collected'),ringsMissed:count('missed'),asteroidCollisions:count('collision'),asteroidsAvoided:count('avoided'),resolved:this.events.length,score:count('collected')*100,completedMissions:this.stageResults.filter(r=>r.status==='completed').length});
    this.stats.ringsPresented=this.stageResults.reduce((n,r)=>n+r.ringsPresented,0);
    this.stats.asteroidsPresented=this.stageResults.reduce((n,r)=>n+r.asteroidsPresented,0);
    this.updateAccuracy();this.stats.upgradeTier=this.stats.ringsCollected>=this.config.accessibility.upgrade3?3:this.stats.ringsCollected>=this.config.accessibility.upgrade2?2:1;
    this.loadMission();this.status='ready';this.revision++;return true;
  }
  skipStage(){if(!this.curriculumId||this.status==='complete'||this.status==='mission-complete')return false;this.acceptStage('skipped');this.status=this.stageResults.length===9?'complete':'mission-complete';this.accumulator=0;this.revision++;return true;}
  private updateAccuracy() { this.stats.collectionAccuracy = this.stats.ringsPresented ? this.stats.ringsCollected / this.stats.ringsPresented : null; }
  private resolve(object: GameplayObject, outcome: Exclude<EncounterOutcome, 'pending'>) {
    if (object.outcome !== 'pending') return;
    object.outcome = outcome;
    if (outcome === 'collected') { this.stats.ringsCollected++; this.stats.score += 100; }
    else if (outcome === 'missed') this.stats.ringsMissed++;
    else if (outcome === 'collision') this.stats.asteroidCollisions++;
    else this.stats.asteroidsAvoided++;
    this.stats.resolved++; this.updateAccuracy();
    this.stats.upgradeTier = this.stats.ringsCollected >= this.config.accessibility.upgrade3 ? 3 : this.stats.ringsCollected >= this.config.accessibility.upgrade2 ? 2 : 1;
    this.events.push({ sessionId: this.sessionId, runId: this.runId, mission: this.mission, objectId: object.id, outcome, atSeconds: this.elapsedSeconds }); this.revision++;
  }
  snapshot(): GameplaySnapshot { return { status: this.status, mission: this.mission+1, missionName: this.missionName, runId: this.runId, stats: { ...this.stats } }; }
}
