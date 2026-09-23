// Запуск с переносимой версией Node.js на Windows без изменения системного PATH.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
const nodeDir = path.dirname(process.execPath);
const npm = path.join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js');
const result = spawnSync(process.execPath, ['--dns-result-order=ipv4first', npm, ...process.argv.slice(2)], { stdio: 'inherit', env: { ...process.env, PATH: nodeDir + path.delimiter + process.env.PATH, NODE_OPTIONS: '--dns-result-order=ipv4first' } });
process.exitCode = result.status ?? 1;
