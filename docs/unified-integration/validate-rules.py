import os,re,pathlib,subprocess,sys
files=[pathlib.Path(p) for p in sys.argv[1:]] if len(sys.argv)>1 else list(pathlib.Path('lib').glob('*/__tests__/rules.emulator.test.ts'));env=os.environ.copy();env.update(SHUMOS_RULES_DB_PORT='19940',SHUMOS_RULES_AUTH_PORT='19949')
for p in files:
 for key in re.findall(r'process.env.([A-Z0-9_]+)',p.read_text()):
  if key.endswith('_EMULATOR'):env[key]='1'
import urllib.request,json
clear=urllib.request.Request('http://127.0.0.1:19949/emulator/v1/projects/demo-shumos-unified/accounts',method='DELETE')
with urllib.request.urlopen(clear):pass
namespaces=set()
for p in files:
 namespaces.update(re.findall(r"demo-[a-zA-Z0-9_-]+",p.read_text()))
for ns in list(namespaces):
 if not ns.endswith('-default-rtdb'):namespaces.add(ns+'-default-rtdb')
for ns in sorted(namespaces):
 if ns.endswith('-default-rtdb'):
  clear=urllib.request.Request('http://127.0.0.1:19940/.json?ns='+ns,data=b'null',method='PUT',headers={'Authorization':'Bearer owner','Content-Type':'application/json'})
  with urllib.request.urlopen(clear):pass
  req=urllib.request.Request('http://127.0.0.1:19940/.settings/rules.json?ns='+ns,data=pathlib.Path('database.rules.json').read_bytes(),method='PUT',headers={'Authorization':'Bearer owner','Content-Type':'application/json'})
  with urllib.request.urlopen(req) as response:
   print('Loaded final rules:',ns,response.status,flush=True)
r=subprocess.run(['npx','vitest','run','--maxWorkers=1','--reporter=verbose',*[str(p) for p in files]],env=env);raise SystemExit(r.returncode)
