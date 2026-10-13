import os,re,pathlib,subprocess,sys
E=os.environ.copy()
E.update(NEXT_PUBLIC_FIREBASE_API_KEY='fake',NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN='demo-shumos-unified.local',NEXT_PUBLIC_FIREBASE_PROJECT_ID='demo-shumos-unified',NEXT_PUBLIC_FIREBASE_DATABASE_URL='http://127.0.0.1:19940/?ns=demo-shumos-unified-default-rtdb',NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET='demo-shumos-unified.local',NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID='000000',NEXT_PUBLIC_FIREBASE_APP_ID='demo-shumos-unified',NEXT_PUBLIC_FIREBASE_EMULATOR_HOST='127.0.0.1',NEXT_PUBLIC_FIREBASE_EMULATOR_PORT='19940',NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_PORT='19949',SHUMOS_BUILD_DIR='.next-control-ux',SHUMOS_TSCONFIG='tsconfig.balancebridge.json',MUNSIT_API_KEY='',MUNSIT_TTS_ENABLED='false',YOUTUBE_API_KEY='',TTS_PROVIDER='disabled')
for p in pathlib.Path('lib').rglob('*.ts'):
 for k in re.findall(r'process.env.(NEXT_PUBLIC_\w+)',p.read_text()):
  if 'FIREBASE' not in k and ('3D' in k or 'HEX' in k):E[k]='1' if k=='NEXT_PUBLIC_RUNNER_QUEST_3D' else 'true'
E['NEXT_PUBLIC_BALLOON_QUEST_LEGACY']='0'
print('Runtime: emulator-only; all canonical feature flags enabled',flush=True)
r=subprocess.run(sys.argv[1:],env=E);raise SystemExit(r.returncode)
