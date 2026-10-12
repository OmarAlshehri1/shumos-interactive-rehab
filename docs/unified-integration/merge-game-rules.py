"""Review helper used during this integration. Adds a branch's game-specific rules to a local
candidate and updates the Console copy. Never publishes. The final committed JSON includes
additional reviewed fixes for shared fields, early-ended history and calibration commands.
Do not regenerate the final release solely with this helper."""
import json,subprocess,sys
G=sys.argv[1];p='database.rules.json'
branch=sys.argv[2]
ancestor=subprocess.check_output(['git','merge-base','3587011',branch]).decode().strip()
base=json.loads(subprocess.check_output(['git','show',ancestor+':database.rules.json']))
ours=json.load(open(p))
theirs=json.loads(subprocess.check_output(['git','show',branch+':database.rules.json']))
def merge(b,a,c,path=()):
 if c==b:return a
 if a==b:return c
 if a==c:return a
 if isinstance(a,dict) and isinstance(c,dict):
  out=dict(a)
  for k,v in c.items():out[k]=merge(b.get(k) if isinstance(b,dict) else None,a.get(k),v,path+(k,)) if k in a else v
  return out
 if isinstance(a,str) and isinstance(c,str) and path[-1] in ('.validate','.write'):
  if path[-2]=='gameId':return f'({a}) || ({c})'
  if 'liveSession' in path:
   depth=len(path)-path.index('liveSession')-2
  elif '$sessionId' in path:
   depth=len(path)-path.index('$sessionId')-2
  else:raise Exception('Unrecognized rules conflict '+str(path))
  node='newData'+'.parent()'*depth
  check=f"{node}.child('gameId').val() == '{G}'"
  return f'(({check}) && ({c})) || ((!({check})) && ({a}))'
 raise Exception('Unexpected rules conflict '+str(path))
obj=merge(base,ours,theirs)
for p in ('database.rules.json','docs/release/FINAL_DATABASE_RULES_FOR_FIREBASE_CONSOLE.json'):open(p,'w').write(json.dumps(obj,ensure_ascii=False,indent=2)+'\n')
