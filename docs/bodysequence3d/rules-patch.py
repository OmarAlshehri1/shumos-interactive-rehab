#!/usr/bin/env python3
"""Adds Body Sequence 3D (`body-sequence-3d`, engine tag `bs3`) to database.rules.json and the Firebase-console copy.
Idempotent: refuses to run twice. Safe to run AFTER another game's patch (shared field names are OR-extended, never replaced).
Usage: python3 docs/bodysequence3d/rules-patch.py   (from the repo root). Nothing is published."""
import json, sys
FILES = ['database.rules.json', 'docs/release/FINAL_DATABASE_RULES_FOR_FIREBASE_CONSOLE.json']
G = 'body-sequence-3d'

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
    ls['.write'] = ls['.write'].replace(anchor, anchor + f" && (newData.child('gameId').val() != '{G}' || (root.child('controllerLease').child('ownerId').val() == auth.uid && newData.child('session').child('bs3').child('ownerId').val() == auth.uid))", 1)
    old = "newData.val() == 'safe-hex-arena-3d'"
    for node in (ls['gameId'], r['sessions']['$historyPatientId']['$sessionId']['gameId']):
        assert old in node['.validate']
        node['.validate'] = node['.validate'].replace(old, old + f" || newData.val() == '{G}'", 1)
    anchor = "newData.child('hex3').child('payload').val().length <= 32768))"
    assert anchor in ls['session']['.validate']
    ls['session']['.validate'] = ls['session']['.validate'].replace(anchor, anchor + f" && (newData.parent().child('gameId').val() != '{G}' || (newData.child('engine').val() == 'bs3' && newData.child('engineVersion').val() == 1 && newData.child('bs3').hasChildren(['ownerId','payload','controlTabId','heartbeatAt']) && newData.child('bs3').child('payload').isString() && newData.child('bs3').child('payload').val().length <= 32768))", 1)

    # --- permanent history: one record per run, no score / accuracy / speed fields ---
    h = r['sessions']['$historyPatientId']['$sessionId']
    anchor = "(newData.child('gameId').val() != 'safe-hex-arena-3d' || root.child('patients').child($historyPatientId).exists())"
    assert anchor in h['.write']
    h['.write'] = h['.write'].replace(anchor, anchor + f" && (newData.child('gameId').val() != '{G}' || root.child('patients').child($historyPatientId).exists())", 1)
    fields = ['engine','resultVersion','durationMs','activeTimeMs','totalMovements','confirmedMovements','assistedMovements','skippedMovements','unfinishedMovements','movementAttempts','incorrectAttempts','repeats','replays','holdsCompleted','holdsAssisted','sequencesCompleted','sequencesPresented','settings','stageResults']
    clause = (f"(newData.child('gameId').val() == '{G}' && newData.hasChildren({json.dumps(fields).replace(chr(34), chr(39))}) && newData.child('engine').val() == 'bs3' && newData.child('resultVersion').val() == 1"
              " && newData.child('completedStageCount').val() + newData.child('skippedStageCount').val() <= 9"
              " && newData.child('confirmedMovements').val() + newData.child('assistedMovements').val() + newData.child('skippedMovements').val() + newData.child('unfinishedMovements').val() == newData.child('totalMovements').val()"
              " && newData.child('confirmedMovements').val() + newData.child('assistedMovements').val() + newData.child('incorrectAttempts').val() == newData.child('movementAttempts').val()"
              " && newData.child('holdsAssisted').val() <= newData.child('holdsCompleted').val() && newData.child('sequencesCompleted').val() <= newData.child('sequencesPresented').val()"
              " && !newData.child('score').exists() && !newData.child('accuracy').exists() && !newData.child('averageReactionTimeMs').exists() && !newData.child('averageResponseTimeMs').exists())")
    anchor = "|| (newData.child('gameId').val() == 'build-quest-3d' && newData.hasChildren(['resultVersion','totalPiecesPlaced'])"
    assert anchor in h['.validate']
    h['.validate'] = h['.validate'].replace(anchor, f"|| {clause} " + anchor, 1)
    h['completedStageCount']['.validate'] += f" && (newData.parent().child('gameId').val() != '{G}' || (newData.val() <= 9 && newData.val() % 1 == 0))"
    old = h['engine']['.validate']
    h['engine']['.validate'] = f"({old}) || (newData.parent().child('gameId').val() == '{G}' && newData.val() == 'bs3' && newData.parent().child('resultVersion').val() == 1)"

    def ensure(key, expr):
        """Adds a field rule for this game; if another game already owns the field name, OR-extends it."""
        mine = f"newData.parent().child('gameId').val() == '{G}' && ({expr})"
        if key in h and '.validate' in h[key]:
            h[key]['.validate'] = f"({h[key]['.validate']}) || ({mine})"
        else:
            h[key] = {'.validate': mine}
    def num(hi):
        return f"newData.isNumber() && newData.val() >= 0 && newData.val() <= {hi} && newData.val() % 1 == 0"
    ensure('activeTimeMs', 'newData.isNumber() && newData.val() >= 0 && newData.val() <= 86400000')
    for k in ['totalMovements','confirmedMovements','assistedMovements','skippedMovements','unfinishedMovements','movementAttempts']:
        ensure(k, num(180))
    ensure('sequencesPresented', num(45)); ensure('sequencesCompleted', num(45))
    for k in ['incorrectAttempts','repeats','replays','holdsCompleted','holdsAssisted']:
        ensure(k, num(1000))
    settings = {
        '.validate': "newData.hasChildren(['maxLanes','feet','holdsEnabled','holdMs','hints','spacing','rotation','mirrored','inputSource'])",
        'maxLanes': {'.validate': 'newData.isNumber() && (newData.val() == 2 || newData.val() == 3)'},
        'feet': {'.validate': "newData.isString() && (newData.val() == 'both' || newData.val() == 'R' || newData.val() == 'L')"},
        'holdsEnabled': {'.validate': 'newData.isBoolean()'},
        'holdMs': {'.validate': 'newData.isNumber() && newData.val() >= 1000 && newData.val() <= 8000'},
        'hints': {'.validate': 'newData.isBoolean()'},
        'spacing': {'.validate': 'newData.isNumber() && newData.val() >= 0.7 && newData.val() <= 1.3'},
        'rotation': {'.validate': 'newData.isNumber() && (newData.val() == 0 || newData.val() == 90 || newData.val() == 180 || newData.val() == 270)'},
        'mirrored': {'.validate': 'newData.isBoolean()'},
        'inputSource': {'.validate': "newData.isString() && (newData.val() == 'MANUAL' || newData.val() == 'SIMULATED')"},
        '$other': {'.validate': False},
    }
    if 'settings' in h:
        # another game already defines settings: keep theirs, add ours as a sibling-by-game branch is not expressible, so extend each child
        for k, v in settings.items():
            if k == '.validate':
                h['settings'][k] = f"({h['settings'][k]}) || (newData.parent().child('gameId').val() == '{G}' && {v})"
            elif k == '$other':
                continue
            elif k in h['settings']:
                h['settings'][k]['.validate'] = f"({h['settings'][k]['.validate']}) || (newData.parent().parent().child('gameId').val() == '{G}' && ({v['.validate']}))"
            else:
                h['settings'][k] = {'.validate': f"newData.parent().parent().child('gameId').val() == '{G}' && ({v['.validate']})"}
        raise SystemExit('settings node already exists: merge manually (see docs/bodysequence3d/FINAL_REPORT.md)')
    h['settings'] = {**settings, '.validate': f"newData.parent().child('gameId').val() == '{G}' && " + settings['.validate']}
    rows = ' || '.join(f"$row == '{i}'" for i in range(9))
    rowfields = ['engine','stageIndex','difficulty','stageNumber','status','lanes','modes','sequences','sequencesCompleted','total','confirmed','assisted','skipped','unfinished','incorrect','repeats','replays','holds','activeMs']
    row = h['stageResults']['$row']
    row['.validate'] = (f"({row['.validate']}) && (newData.parent().parent().child('gameId').val() != '{G}' || (({rows}) && newData.hasChildren({json.dumps(rowfields).replace(chr(34), chr(39))}) && newData.child('engine').val() == 'bs3'"
        " && newData.child('stageIndex').isNumber() && newData.child('stageIndex').val() >= 0 && newData.child('stageIndex').val() <= 8 && newData.child('stageIndex').val() % 1 == 0 && newData.child('stageNumber').val() == newData.child('stageIndex').val() % 3 + 1"
        " && (newData.child('status').val() == 'COMPLETED' || newData.child('status').val() == 'SKIPPED')"
        " && ((newData.child('stageIndex').val() < 3 && newData.child('difficulty').val() == 'EASY') || (newData.child('stageIndex').val() >= 3 && newData.child('stageIndex').val() < 6 && newData.child('difficulty').val() == 'MEDIUM') || (newData.child('stageIndex').val() >= 6 && newData.child('difficulty').val() == 'ADVANCED'))"
        " && ((newData.child('stageIndex').val() < 3 && newData.child('lanes').val() == 2) || (newData.child('stageIndex').val() >= 3 && newData.child('lanes').val() == 3))"
        " && newData.child('modes').hasChildren() && newData.child('sequences').isNumber() && newData.child('sequences').val() >= 1 && newData.child('sequences').val() <= 6 && newData.child('sequencesCompleted').isNumber() && newData.child('sequencesCompleted').val() <= newData.child('sequences').val()"
        " && newData.child('total').isNumber() && newData.child('total').val() >= 0 && newData.child('total').val() <= 24 && newData.child('total').val() % 1 == 0"
        " && newData.child('confirmed').val() + newData.child('assisted').val() + newData.child('skipped').val() + newData.child('unfinished').val() == newData.child('total').val()"
        " && newData.child('incorrect').isNumber() && newData.child('repeats').isNumber() && newData.child('replays').isNumber() && newData.child('holds').isNumber() && newData.child('activeMs').isNumber()))")
    out = json.dumps(obj, indent=2, ensure_ascii=False) + '\n'
    open(path, 'w').write(out)
    print('patched', path, len(raw), '->', len(out))

for f in FILES:
    patch(f)
