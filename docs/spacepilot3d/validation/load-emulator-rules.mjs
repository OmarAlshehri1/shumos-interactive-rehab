import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const rules = readFileSync('database.rules.json', 'utf8');
for (const namespace of ['demo-spacepilot-default-rtdb', 'demo-buildquest-default-rtdb', 'demo-rq3-default-rtdb', 'demo-bq3-default-rtdb']) {
  const r = await fetch(`http://127.0.0.1:19200/.settings/rules.json?ns=${namespace}`, { method: 'PUT', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: rules });
  assert.equal(r.status, 200, await r.text());
}
console.log('Complete merged rules loaded into four isolated loopback demo namespaces only.');
