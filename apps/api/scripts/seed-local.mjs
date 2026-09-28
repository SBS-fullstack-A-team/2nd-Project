// 로컬 D1 에 seeds/*.sql 을 파일명 순서대로 모두 적용한다.
// 게임마다 시드 파일을 따로 두어(seeds/<게임id>.sql) 팀원 간 충돌 없이 추가만 하기 위함.
// ※ Node 로 실행하는 개발용 스크립트 (Workers 코드 아님)
import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const files = readdirSync(new URL('../seeds', import.meta.url))
  .filter((name) => name.endsWith('.sql'))
  .sort();

if (files.length === 0) {
  console.log('적용할 시드 파일이 없습니다.');
}

for (const file of files) {
  console.log(`\n▶ 시드 적용: seeds/${file}`);
  execFileSync(
    'pnpm',
    ['exec', 'wrangler', 'd1', 'execute', 'simsim-arcade-db', '--local', `--file=seeds/${file}`],
    // Windows 에서는 pnpm.cmd 실행을 위해 shell 필요
    { stdio: 'inherit', shell: process.platform === 'win32' },
  );
}
