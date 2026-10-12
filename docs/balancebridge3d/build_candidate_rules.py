"""Build a reviewable, emulator-only candidate from the current shared rules. Never deploys."""
import copy,json
from pathlib import Path
r=json.loads(Path('database.rules.json').read_text());live=r['rules']['liveSession'];h=r['rules']['sessions']['$historyPatientId']['$sessionId']
new="newData.child('gameId').val() == 'balance-bridge-3d'"
def parts(expr):
 out=[];level=0;start=0;quoted=False
 for i,c in enumerate(expr):
  if c=="'":quoted=not quoted
  if quoted:continue
  if c=='(':level+=1
  elif c==')':level-=1
  if level==0 and expr[i:i+4]==' && ':out.append(expr[start:i]);start=i+4
 out.append(expr[start:]);return out
for expr in parts(live['.write']):
 if 'blooming-world-3d' in expr:live['.write']+=' && '+expr.replace('blooming-world-3d','balance-bridge-3d').replace('bw3','bb3')
live['gameId']['.validate']="("+live['gameId']['.validate']+") || (newData.isString() && newData.val() == 'balance-bridge-3d')"
for expr in parts(live['session']['.validate']):
 if 'blooming-world-3d' in expr:live['session']['.validate']+=' && '+expr.replace('blooming-world-3d','balance-bridge-3d').replace('bw3','bb3')
live['session']['bb3']=json.loads(json.dumps(live['session']['bw3']).replace('blooming-world-3d','balance-bridge-3d').replace('bw3','bb3'))
common=['sessionId','patientId','gameId','startedAt','completedAt','createdByUid','startingDifficulty','startingStage','endingDifficulty','endingStage','completedStageCount','skippedStageCount','durationMs','engine','resultVersion','stageResults','checkpointsAttempted','checkpointsConfirmed','assistedCheckpoints','skippedCheckpoints','pathDeviations','holdCompletions','sessionCompleted']
cond=f"{new} && newData.hasChildren({str(common)}) && newData.child('patientId').val() == $historyPatientId && newData.child('sessionId').val() == $sessionId && newData.child('createdByUid').val() == auth.uid && newData.child('engine').val() == 'bb3' && newData.child('resultVersion').val() == 1 && newData.child('completedAt').val() >= newData.child('startedAt').val() && newData.child('assistedCheckpoints').val() <= newData.child('checkpointsConfirmed').val() && newData.child('checkpointsConfirmed').val() + newData.child('skippedCheckpoints').val() <= 61 && newData.child('completedStageCount').val() + newData.child('skippedStageCount').val() <= 9"
h['.validate']=f"({cond}) || (!({new}) && ({h['.validate']}))"
h['.write']+=f" && (!({new}) || root.child('patients').child($historyPatientId).exists())"
parent="newData.parent().child('gameId').val() == 'balance-bridge-3d'"
for k in ['gameId','engine','resultVersion','sessionCompleted']:
 old=h[k]['.validate'];specific={'gameId':"newData.val() == 'balance-bridge-3d'",'engine':"newData.val() == 'bb3'",'resultVersion':'newData.val() == 1','sessionCompleted':"newData.isBoolean() && newData.val() == (newData.parent().child('completedStageCount').val() == 9)"}[k]
 h[k]['.validate']=f"({old}) || ({parent} && {specific})"
for k in ['checkpointsAttempted','checkpointsConfirmed','assistedCheckpoints','skippedCheckpoints','pathDeviations','holdCompletions']:
 h[k]={'.validate':f"{parent} && newData.isNumber() && newData.val() % 1 == 0 && newData.val() >= 0 && newData.val() <= 1000000"}
rows=h['stageResults']['$row'];rowgame="newData.parent().parent().child('gameId').val() == 'balance-bridge-3d'"
valid_index="("+' || '.join(f"$row == '{i}'" for i in range(9))+")"
rowfields=['stage','stageIndex','stageNumber','difficulty','status','config','checkpoints','deviations','repeats','elapsed','completed']
rows['.validate']=f"({rowgame} && {valid_index} && newData.hasChildren({str(rowfields)}) && newData.child('stageIndex').val() == newData.child('stage').val() && newData.child('completed').isBoolean()) || (!({rowgame}) && ({rows['.validate']}))"
for k in ['stage','deviations','repeats','elapsed']:
 rows[k]={'.validate':f"{rowgame} && newData.isNumber() && newData.val() >= 0 && newData.val() <= 1000000000"}
rows['completed']={'.validate':f"{rowgame} && newData.isBoolean()"}
rows['config']={'.validate':f"{rowgame} && newData.child('projection').val() == 'FLOOR' && newData.child('customWidthCm').isNumber() && newData.child('customWidthCm').val() >= 30 && newData.child('customWidthCm').val() <= 200 && newData.child('holdSeconds').isNumber() && newData.child('holdSeconds').val() >= 0 && newData.child('holdSeconds').val() <= 15"}
rows['checkpoints']={'.validate':rowgame,'$point':{'.validate':"($point == '0' || $point == '1' || $point == '2' || $point == '3' || $point == '4' || $point == '5' || $point == '6') && newData.hasChildren(['id','outcome','attempts','holdCompleted']) && newData.child('id').isNumber() && newData.child('id').val() >= 0 && newData.child('id').val() <= 6 && (newData.child('outcome').val() == 'pending' || newData.child('outcome').val() == 'confirmed' || newData.child('outcome').val() == 'assisted' || newData.child('outcome').val() == 'skipped') && newData.child('attempts').isNumber() && newData.child('attempts').val() % 1 == 0 && newData.child('attempts').val() >= 0 && newData.child('holdCompleted').isBoolean()"}}
# StageIndex validator historically ties its row key to curriculum index; Bridge selected starts retain the actual index.
rows['stageIndex']['.validate']=f"({rows['stageIndex']['.validate']}) || ({rowgame} && newData.isNumber() && newData.val() % 1 == 0 && newData.val() >= 0 && newData.val() <= 8)"
# Field validators run one level below the row validator.
for key in ['stage','deviations','repeats','elapsed','completed','config','checkpoints','stageIndex']:
 rows[key]['.validate']=rows[key]['.validate'].replace("newData.parent().parent().child('gameId')", "newData.parent().parent().parent().child('gameId')")
# Visit references use the existing immutable session linkage; only extend enum allowlists.
def visit_ids(obj):
 if isinstance(obj,dict):
  for k,v in obj.items():
   if k=='.validate' and isinstance(v,str) and "newData.val() == 'blooming-world-3d'" in v:
    obj[k]=v.replace("newData.val() == 'blooming-world-3d'","(newData.val() == 'blooming-world-3d' || newData.val() == 'balance-bridge-3d')")
   elif isinstance(v,dict):visit_ids(v)
for key in ['therapyVisits','activeVisits']:
 if key in r['rules']:visit_ids(r['rules'][key])
Path('docs/balancebridge3d/CANDIDATE_DATABASE_RULES.json').write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n')
