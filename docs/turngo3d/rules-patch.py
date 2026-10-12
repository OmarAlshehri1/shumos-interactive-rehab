#!/usr/bin/env python3
"""Adds Turn & Go 3D (`turn-and-go-3d`, engine tag `tg3`) to database.rules.json and the Firebase-console copy.
Idempotent: refuses to run twice. Usage: python3 docs/turngo3d/rules-patch.py   (from the repo root). Nothing is published."""
import json, sys
FILES = ['database.rules.json', 'docs/release/FINAL_DATABASE_RULES_FOR_FIREBASE_CONSOLE.json']
G = 'turn-and-go-3d'

def patch(path):
    raw = open(path).read()
    obj = json.loads(raw)
    if G in raw:
        sys.exit(f'{path}: already contains {G}')
    r = obj['rules']

    # --- live session: owner fenced by the controller lease, payload bounded ---
    ls = r['liveSession']
    anchor = "(newData.child('gameId').val() != 'safe-hex-arena-3d' || (root.child('controllerLease').child('ownerId').val() == auth.uid && newData.child('session').child('hex3').child('ownerId').val() == auth.uid))"
    assert anchor in ls['.write']
    ls['.write'] = ls['.write'].replace(anchor, anchor + f" && (newData.child('gameId').val() != '{G}' || (root.child('controllerLease').child('ownerId').val() == auth.uid && newData.child('session').child('tg3').child('ownerId').val() == auth.uid))", 1)
    old = "newData.val() == 'safe-hex-arena-3d'"
    for node in (ls['gameId'], r['sessions']['$historyPatientId']['$sessionId']['gameId']):
        assert old in node['.validate']
        node['.validate'] = node['.validate'].replace(old, old + f" || newData.val() == '{G}'", 1)
    anchor = "newData.child('hex3').child('payload').val().length <= 32768))"
    assert anchor in ls['session']['.validate']
    ls['session']['.validate'] = ls['session']['.validate'].replace(anchor, anchor + f" && (newData.parent().child('gameId').val() != '{G}' || (newData.child('engine').val() == 'tg3' && newData.child('engineVersion').val() == 1 && newData.child('tg3').hasChildren(['ownerId','payload','controlTabId','heartbeatAt']) && newData.child('tg3').child('payload').isString() && newData.child('tg3').child('payload').val().length <= 32768))", 1)

    # --- permanent history: one record per run, no score / accuracy / speed fields ---
    h = r['sessions']['$historyPatientId']['$sessionId']
    anchor = "(newData.child('gameId').val() != 'safe-hex-arena-3d' || root.child('patients').child($historyPatientId).exists())"
    assert anchor in h['.write']
    h['.write'] = h['.write'].replace(anchor, anchor + f" && (newData.child('gameId').val() != '{G}' || root.child('patients').child($historyPatientId).exists())", 1)
    fields = ['engine','resultVersion','durationMs','activeTimeMs','totalCheckpoints','confirmedCheckpoints','assistedCheckpoints','skippedCheckpoints','unfinishedCheckpoints','stopsPresented','stopHoldsCompleted','stopHoldsAssisted','routeDeviations','coneTouches','repeats','routeEvents','settings','stageResults']
    clause = (f"(newData.child('gameId').val() == '{G}' && newData.hasChildren({json.dumps(fields).replace(chr(34), chr(39))}) && newData.child('engine').val() == 'tg3' && newData.child('resultVersion').val() == 1"
              " && newData.child('completedStageCount').val() + newData.child('skippedStageCount').val() <= 9"
              " && newData.child('confirmedCheckpoints').val() + newData.child('assistedCheckpoints').val() + newData.child('skippedCheckpoints').val() + newData.child('unfinishedCheckpoints').val() == newData.child('totalCheckpoints').val()"
              " && newData.child('stopHoldsAssisted').val() <= newData.child('stopHoldsCompleted').val()"
              " && !newData.child('score').exists() && !newData.child('accuracy').exists() && !newData.child('averageReactionTimeMs').exists() && !newData.child('averageResponseTimeMs').exists())")
    anchor = "|| (newData.child('gameId').val() == 'build-quest-3d' && newData.hasChildren(['resultVersion','totalPiecesPlaced'])"
    assert anchor in h['.validate']
    h['.validate'] = h['.validate'].replace(anchor, f"|| {clause} " + anchor, 1)
    anchor = "(newData.parent().child('gameId').val() != 'pearl-voyage-3d' || (newData.val() <= 9 && newData.val() % 1 == 0))"
    assert anchor in h['completedStageCount']['.validate']
    h['completedStageCount']['.validate'] += f" && (newData.parent().child('gameId').val() != '{G}' || (newData.val() <= 9 && newData.val() % 1 == 0))"
    old = h['engine']['.validate']
    h['engine']['.validate'] = f"({old}) || (newData.parent().child('gameId').val() == '{G}' && newData.val() == 'tg3' && newData.parent().child('resultVersion').val() == 1)"

    def num(hi, extra=''):
        return {'.validate': f"newData.parent().child('gameId').val() == '{G}' && (newData.isNumber() && newData.val() >= 0 && newData.val() <= {hi} && newData.val() % 1 == 0{extra})"}
    h['activeTimeMs'] = {'.validate': f"newData.parent().child('gameId').val() == '{G}' && (newData.isNumber() && newData.val() >= 0 && newData.val() <= 86400000)"}
    for k in ['totalCheckpoints','confirmedCheckpoints','assistedCheckpoints','skippedCheckpoints','unfinishedCheckpoints']:
        h[k] = num(180)
    for k in ['stopsPresented','stopHoldsCompleted','stopHoldsAssisted','routeDeviations','coneTouches','repeats','routeEvents']:
        h[k] = num(1000)
    h['settings'] = {
        '.validate': f"newData.parent().child('gameId').val() == '{G}' && (newData.hasChildren(['layout','coneCount','customLayout','stopMs','stopsEnabled','eventsEnabled','rotation','mirrored','inputSource']))",
        'layout': {'.validate': "newData.isString() && newData.val().length > 0 && newData.val().length <= 12"},
        'coneCount': {'.validate': "newData.isNumber() && newData.val() >= 0 && newData.val() <= 8 && newData.val() % 1 == 0"},
        'customLayout': {'.validate': 'newData.isBoolean()'},
        'stopMs': {'.validate': 'newData.isNumber() && newData.val() >= 2000 && newData.val() <= 10000'},
        'stopsEnabled': {'.validate': 'newData.isBoolean()'},
        'eventsEnabled': {'.validate': 'newData.isBoolean()'},
        'rotation': {'.validate': 'newData.isNumber() && (newData.val() == 0 || newData.val() == 90 || newData.val() == 180 || newData.val() == 270)'},
        'mirrored': {'.validate': 'newData.isBoolean()'},
        'inputSource': {'.validate': "newData.isString() && (newData.val() == 'MANUAL' || newData.val() == 'SIMULATED')"},
        '$other': {'.validate': False},
    }
    rows = ' || '.join(f"$row == '{i}'" for i in range(9))
    rowfields = ['engine','stageIndex','difficulty','stageNumber','status','course','coneCount','customLayout','total','confirmed','assisted','skipped','unfinished','stops','holds','deviations','coneTouches','repeats','events','activeMs']
    row = h['stageResults']['$row']
    row['.validate'] = (f"({row['.validate']}) && (newData.parent().parent().child('gameId').val() != '{G}' || (({rows}) && newData.hasChildren({json.dumps(rowfields).replace(chr(34), chr(39))}) && newData.child('engine').val() == 'tg3'"
        " && newData.child('stageIndex').isNumber() && newData.child('stageIndex').val() >= 0 && newData.child('stageIndex').val() <= 8 && newData.child('stageIndex').val() % 1 == 0 && newData.child('stageNumber').val() == newData.child('stageIndex').val() % 3 + 1"
        " && (newData.child('status').val() == 'COMPLETED' || newData.child('status').val() == 'SKIPPED')"
        " && ((newData.child('stageIndex').val() < 3 && newData.child('difficulty').val() == 'EASY') || (newData.child('stageIndex').val() >= 3 && newData.child('stageIndex').val() < 6 && newData.child('difficulty').val() == 'MEDIUM') || (newData.child('stageIndex').val() >= 6 && newData.child('difficulty').val() == 'ADVANCED'))"
        " && newData.child('course').isString() && newData.child('course').val().length > 0 && newData.child('course').val().length <= 12"
        " && newData.child('coneCount').isNumber() && newData.child('coneCount').val() >= 0 && newData.child('coneCount').val() <= 8 && newData.child('customLayout').isBoolean()"
        " && newData.child('total').isNumber() && newData.child('total').val() >= 0 && newData.child('total').val() <= 20 && newData.child('total').val() % 1 == 0"
        " && newData.child('confirmed').val() + newData.child('assisted').val() + newData.child('skipped').val() + newData.child('unfinished').val() == newData.child('total').val()"
        " && newData.child('stops').isNumber() && newData.child('holds').isNumber() && newData.child('deviations').isNumber() && newData.child('coneTouches').isNumber() && newData.child('repeats').isNumber() && newData.child('events').isNumber() && newData.child('activeMs').isNumber()))")
    out = json.dumps(obj, indent=2, ensure_ascii=False) + '\n'
    open(path, 'w').write(out)
    print('patched', path, len(raw), '->', len(out))

for f in FILES:
    patch(f)
