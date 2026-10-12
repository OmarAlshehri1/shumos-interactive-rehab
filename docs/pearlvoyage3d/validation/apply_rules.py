import json, copy, sys
P='database.rules.json'
raw=open(P).read()
d=json.loads(raw)
assert json.dumps(d,indent=2,ensure_ascii=False)+"\n"==raw, 'round-trip must be exact'
r=d['rules']
PV="pearl-voyage-3d"
if PV in raw:
    print('already applied'); sys.exit(0)
def rep(s,a,b):
    assert s.count(a)==1,(a[:90],s.count(a)); return s.replace(a,b)
ls=r['liveSession']
sp="newData.child('session').child('pv3')"
dp="data.child('session').child('pv3')"
ls['.write']+=(" && (newData.child('gameId').val() != 'pearl-voyage-3d' || (root.child('controllerLease').child('ownerId').val() == auth.uid && "+sp+".child('ownerId').val() == auth.uid && (data.child('gameId').val() != 'pearl-voyage-3d' || data.child('sessionId').val() != newData.child('sessionId').val() || "+dp+".child('controlTabId').val() == "+sp+".child('controlTabId').val() || now - "+dp+".child('heartbeatAt').val() > 15000 || "+sp+".child('takeoverFrom').val() == "+dp+".child('controlTabId').val())))")
ls['gameId']['.validate']=rep(ls['gameId']['.validate'],"newData.val() == 'fire-rescue-3d'","newData.val() == 'fire-rescue-3d' || newData.val() == 'pearl-voyage-3d'")
ls['session']['.validate']+=(" && (newData.parent().child('gameId').val() != 'pearl-voyage-3d' || (newData.child('sessionId').val() == newData.parent().child('sessionId').val() && newData.child('engine').val() == 'pv3' && newData.child('engineVersion').val() == 1 && newData.child('pv3').hasChildren(['ownerId','payload','controlTabId','heartbeatAt'])))")
fr3=json.loads(json.dumps(ls['session']['fr3']).replace('fire-rescue-3d',PV))
sess={}
for k,v in ls['session'].items():
    sess[k]=v
    if k=='fr3': sess['pv3']=fr3
ls['session']=sess
h=r['sessions']['$historyPatientId']['$sessionId']
h['.write']+=" && (newData.child('gameId').val() != 'pearl-voyage-3d' || root.child('patients').child($historyPatientId).exists())"
branch=("(newData.child('gameId').val() == 'pearl-voyage-3d' && newData.hasChildren(['resultVersion','engine','durationMs','fishDiscovered','assistedEncounters','independentEncounters','skippedEncounters','repeatedEncounters','participationMode','sessionCompleted','inputSource']) && newData.child('resultVersion').val() == 1 && newData.child('engine').val() == 'pv3' && newData.child('completedStageCount').val() + newData.child('skippedStageCount').val() <= 9 && newData.child('assistedEncounters').val() + newData.child('independentEncounters').val() == newData.child('fishDiscovered').val() && newData.child('sessionCompleted').val() == (newData.child('completedStageCount').val() == 9) && !newData.child('accuracy').exists() && !newData.child('averageReactionTimeMs').exists() && !newData.child('averageResponseTimeMs').exists())")
anchor="newData.hasChildren(['resultVersion','totalPiecesPlaced']) && newData.child('resultVersion').val() == 1)"
h['.validate']=rep(h['.validate'],anchor,anchor+" || "+branch)
h['gameId']['.validate']=rep(h['gameId']['.validate'],"newData.val() == 'fire-rescue-3d'","newData.val() == 'fire-rescue-3d' || newData.val() == 'pearl-voyage-3d'")
stage_clause="(newData.parent().child('gameId').val() != 'fire-rescue-3d' || (newData.val() <= 3 && newData.val() % 1 == 0))"
for k in ('startingStage','endingStage'):
    h[k]['.validate']=rep(h[k]['.validate'],stage_clause,stage_clause+" && (newData.parent().child('gameId').val() != 'pearl-voyage-3d' || (newData.val() <= 3 && newData.val() % 1 == 0))")
for k in ('completedStageCount','skippedStageCount'):
    h[k]['.validate']+=" && (newData.parent().child('gameId').val() != 'pearl-voyage-3d' || (newData.val() <= 9 && newData.val() % 1 == 0))"
cnt=lambda hi: "newData.parent().child('gameId').val() == 'pearl-voyage-3d' && newData.isNumber() && newData.val() % 1 == 0 && newData.val() >= 0 && newData.val() <= " + str(hi)
new={}
for k,v in h.items():
    new[k]=v
    if k=='drivingObjectives': pass
h=new
for k,hi in (('fishDiscovered',29),('assistedEncounters',29),('independentEncounters',29),('skippedEncounters',29),('repeatedEncounters',1000000)):
    h[k]={'.validate':cnt(hi)}
r['sessions']['$historyPatientId']['$sessionId']=h
h['participationMode']['.validate']+=" || (newData.parent().child('gameId').val() == 'pearl-voyage-3d' && (newData.val() == 'MANUAL' || newData.val() == 'WHEEL' || newData.val() == 'PEDAL' || newData.val() == 'WHEEL_PEDAL' || newData.val() == 'MIXED'))"
h['sessionCompleted']['.validate']+=" || (newData.parent().child('gameId').val() == 'pearl-voyage-3d' && newData.isBoolean() && newData.val() == (newData.parent().child('completedStageCount').val() == 9))"
h['engine']['.validate']+=" || (newData.parent().child('gameId').val() == 'pearl-voyage-3d' && newData.val() == 'pv3' && newData.parent().child('resultVersion').val() == 1)"
row=h['stageResults']['$row']
rowstrict=("(newData.parent().parent().child('gameId').val() != 'pearl-voyage-3d' || (($row == '0' || $row == '1' || $row == '2' || $row == '3' || $row == '4' || $row == '5' || $row == '6' || $row == '7' || $row == '8') && newData.hasChildren(['engine','stageIndex','difficulty','stageNumber','status','fishDiscovered','assistedEncounters','skippedEncounters']) && newData.child('engine').val() == 'pv3' && newData.child('stageIndex').isNumber() && newData.child('stageIndex').val() % 1 == 0 && newData.child('stageIndex').val() >= 0 && newData.child('stageIndex').val() <= 8 && newData.child('stageNumber').val() == newData.child('stageIndex').val() % 3 + 1 && (newData.child('status').val() == 'COMPLETED' || newData.child('status').val() == 'SKIPPED' || newData.child('status').val() == 'PARTIAL') && ((newData.child('stageIndex').val() < 3 && newData.child('difficulty').val() == 'EASY') || (newData.child('stageIndex').val() >= 3 && newData.child('stageIndex').val() < 6 && newData.child('difficulty').val() == 'MEDIUM') || (newData.child('stageIndex').val() >= 6 && newData.child('difficulty').val() == 'ADVANCED')) && newData.child('assistedEncounters').val() <= newData.child('fishDiscovered').val()))")
row['.validate']="("+row['.validate']+") && "+rowstrict
row['$other']['.validate']+=" && newData.parent().parent().parent().child('gameId').val() != 'pearl-voyage-3d'"
rc=lambda hi: "newData.parent().parent().parent().child('gameId').val() == 'pearl-voyage-3d' && newData.isNumber() && newData.val() % 1 == 0 && newData.val() >= 0 && newData.val() <= " + str(hi)
for k,hi in (('fishDiscovered',5),('assistedEncounters',5),('skippedEncounters',5)):
    row[k]={'.validate':rc(hi)}
open(P,'w').write(json.dumps(d,indent=2,ensure_ascii=False)+"\n")
print('applied')
