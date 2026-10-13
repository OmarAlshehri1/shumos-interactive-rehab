#!/usr/bin/env python3
"""Adds Ocean Wonders 3D (`ocean-wonders-3d`, engine tag `ow3`) to database.rules.json and the Firebase-console copy.

Idempotent: refuses to run twice. Wraps existing expressions as  ((G == AC) && (mine)) || (!(G == AC) && (old)),  the same
shape the integrated tree uses for the other games, so every existing game's rule text is preserved verbatim inside `old`.
Usage (repo root): python3 docs/oceanwonders3d/rules-patch.py      NOTHING is published; the console is never touched."""
import json, sys
FILES = ['database.rules.json', 'docs/release/FINAL_DATABASE_RULES_FOR_FIREBASE_CONSOLE.json']
G = 'ocean-wonders-3d'

def patch(path):
    raw = open(path).read()
    if G in raw:
        sys.exit(f'{path}: already contains {G}')
    obj = json.loads(raw)
    r = obj['rules']

    def wrap(gexpr, mine, old):
        return f"(({gexpr} == '{G}') && ({mine})) || ((!({gexpr} == '{G}')) && ({old}))"

    # ---- live session: lease-fenced write, bounded payload ----
    ls = r['liveSession']
    gl = "newData.child('gameId').val()"
    ls['.write'] = wrap(gl, "auth != null && root.child('staff').child(auth.uid).child('active').val() == true && (!data.exists() || !newData.exists() || newData.child('revision').val() > data.child('revision').val()) && root.child('controllerLease').child('ownerId').val() == auth.uid && newData.child('session').child('ow3').child('ownerId').val() == auth.uid", ls['.write'])
    ls['gameId']['.validate'] = f"({ls['gameId']['.validate']}) || (newData.isString() && newData.val() == '{G}')"
    sv = ls['session']['.validate']
    ls['session']['.validate'] = wrap("newData.parent().child('gameId').val()",
        "newData.child('sessionId').val() == newData.parent().child('sessionId').val() && newData.child('engine').val() == 'ow3' && newData.child('engineVersion').val() == 1 && newData.child('ow3').hasChildren(['ownerId','payload','controlTabId','heartbeatAt']) && newData.child('ow3').child('payload').isString() && newData.child('ow3').child('payload').val().length <= 8192", sv)

    # ---- permanent history: one create-only record per run, counts only, no score / accuracy / speed ----
    h = r['sessions']['$historyPatientId']['$sessionId']
    h['gameId']['.validate'] = f"({h['gameId']['.validate']}) || (newData.isString() && newData.val() == '{G}')"
    h['.write'] = wrap(gl, "auth != null && root.child('staff').child(auth.uid).child('active').val() == true && !data.exists() && root.child('patients').child($historyPatientId).exists()", h['.write'])
    fields = ['engine','resultVersion','durationMs','activeTimeMs','exerciseTitle','startingLevel','endingLevel','targetAchievements','confirmedAchievements','assistedAchievements','skippedAchievements','undoCount','levelsCompleted','completion','therapistNotes','settings','levelResults']
    common = "newData.hasChildren(['sessionId','patientId','gameId','startedAt','completedAt','createdByUid','startingDifficulty','startingStage','endingDifficulty','endingStage','completedStageCount','skippedStageCount']) && newData.child('patientId').val() == $historyPatientId && newData.child('sessionId').val() == $sessionId"
    clause = (f"{common} && newData.hasChildren({json.dumps(fields).replace(chr(34), chr(39))}) && newData.child('engine').val() == 'ow3' && newData.child('resultVersion').val() == 1"
              " && newData.child('confirmedAchievements').val() + newData.child('assistedAchievements').val() <= newData.child('targetAchievements').val()"
              " && newData.child('levelsCompleted').val() <= 3 && newData.child('startingLevel').val() <= newData.child('endingLevel').val()"
              " && newData.child('completedStageCount').val() == newData.child('levelsCompleted').val() && newData.child('skippedStageCount').val() == 0"
              " && newData.child('startingStage').val() == newData.child('startingLevel').val() && newData.child('endingStage').val() == newData.child('endingLevel').val()"
              " && !newData.child('score').exists() && !newData.child('accuracy').exists() && !newData.child('averageReactionTimeMs').exists() && !newData.child('averageResponseTimeMs').exists()")
    h['.validate'] = wrap(gl, clause, h['.validate'])

    def ensure(key, expr):
        """Field rule for this game; if the field name already exists for other games, wrap it, never replace it."""
        gk = "newData.parent().child('gameId').val()"
        if key in h and '.validate' in h[key]:
            h[key]['.validate'] = wrap(gk, expr, h[key]['.validate'])
        else:
            h[key] = {'.validate': f"{gk} == '{G}' && ({expr})"}
    def num(hi):
        return f"newData.isNumber() && newData.val() >= 0 && newData.val() <= {hi} && newData.val() % 1 == 0"
    ensure('engine', "newData.isString() && newData.val() == 'ow3' && newData.parent().child('resultVersion').val() == 1")
    ensure('activeTimeMs', 'newData.isNumber() && newData.val() >= 0 && newData.val() <= 86400000')
    for k in ['targetAchievements']: ensure(k, num(90))
    for k in ['confirmedAchievements', 'assistedAchievements', 'skippedAchievements', 'undoCount']: ensure(k, num(1000))
    ensure('levelsCompleted', num(3))
    ensure('startingLevel', 'newData.isNumber() && newData.val() >= 1 && newData.val() <= 3 && newData.val() % 1 == 0')
    ensure('endingLevel', 'newData.isNumber() && newData.val() >= 1 && newData.val() <= 3 && newData.val() % 1 == 0')
    ensure('exerciseTitle', 'newData.isString() && newData.val().length <= 60')
    ensure('therapistNotes', 'newData.isString() && newData.val().length <= 300')
    ensure('completion', "newData.isString() && (newData.val() == 'COMPLETED' || newData.val() == 'PARTIAL')")
    # settings: the node validator is per-game; wrap it, and constrain our two fields
    st = h['settings']
    st['.validate'] = wrap("newData.parent().child('gameId').val()", "newData.hasChildren(['inputSource','controllerConfirmations'])", st['.validate'])
    gs = "newData.parent().parent().child('gameId').val()"
    st['inputSource']['.validate'] = wrap(gs, "newData.isString() && (newData.val() == 'MANUAL' || newData.val() == 'GAMEPAD')", st['inputSource']['.validate'])
    cc = f"newData.isNumber() && newData.val() >= 0 && newData.val() <= 1000 && newData.val() % 1 == 0"
    if 'controllerConfirmations' in st and '.validate' in st['controllerConfirmations']:
        st['controllerConfirmations']['.validate'] = wrap(gs, cc, st['controllerConfirmations']['.validate'])
    else:
        st['controllerConfirmations'] = {'.validate': f"{gs} == '{G}' && {cc}"}
    # one row per level reached (levels 1..3 only; there are no stages)
    row_fields = ['engine','level','target','confirmed','assisted','skipped','undos','status','activeMs']
    row_clause = ("($row == '0' || $row == '1' || $row == '2') && newData.hasChildren(" + json.dumps(row_fields).replace(chr(34), chr(39)) + ") && newData.child('engine').val() == 'ow3'"
                  " && newData.child('level').isNumber() && newData.child('level').val() >= 1 && newData.child('level').val() <= 3"
                  " && newData.child('target').isNumber() && newData.child('target').val() >= 3 && newData.child('target').val() <= 30"
                  " && newData.child('confirmed').val() + newData.child('assisted').val() <= newData.child('target').val()"
                  " && newData.child('skipped').isNumber() && newData.child('undos').isNumber() && newData.child('activeMs').isNumber()"
                  " && (newData.child('status').val() == 'COMPLETED' || newData.child('status').val() == 'PARTIAL')")
    gp = "newData.parent().parent().child('gameId').val()"
    if 'levelResults' in h:
        lr = h['levelResults']
        lr['.validate'] = wrap("newData.parent().child('gameId').val()", 'true', lr.get('.validate', 'false'))
        lr['$row']['.validate'] = wrap(gp, row_clause, lr['$row']['.validate'])
    else:
        h['levelResults'] = {'.validate': f"newData.parent().child('gameId').val() == '{G}'", '$row': {'.validate': row_clause}}
    out = json.dumps(obj, indent=2, ensure_ascii=False) + '\n'
    open(path, 'w').write(out)
    print('patched', path, len(raw), '->', len(out))

for f in FILES:
    patch(f)
