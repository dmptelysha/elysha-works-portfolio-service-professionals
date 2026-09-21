# Portfolio Next Initialization Gates

- [x] G1: The corrected service-professionals repository contains a runnable Next.js App Router foundation with TypeScript and Tailwind CSS.
  CHECK: npm run build
  EXPECT: exit 0
  EVIDENCE: `npm run build` exited 0; Next.js 16.3.5 compiled and statically generated `/` and `/_not-found`.

- [x] G2: The Next.js source passes ESLint and TypeScript validation.
  CHECK: npm run lint && npm run typecheck
  EXPECT: exit 0
  EVIDENCE: `npm run lint` and `npm run typecheck` both exited 0.

- [ ] G3: The existing static portfolio tests still pass unchanged.
  CHECK: npm run check:static
  EXPECT: exit 0
  EVIDENCE: Eight of nine tests pass. The only failure is the isolation checksum for the sibling `Elysha Works Portfolio`, which detects the prior Next scaffold in that separate repository.
ABANDON: G3 Fixing this requires changing or cleaning the sibling repository, which is outside the corrected folder and not authorized by this request.

- [x] G4: The original static implementation remains present.
  CHECK: node -e "const fs=require('fs'); for(const f of ['index.html','styles.css','script.js']) if(!fs.existsSync(f)) process.exit(1)"
  EXPECT: exit 0
  EVIDENCE: `index.html`, `styles.css`, and `script.js` are present; none appears in `git diff --name-only`.

- [x] G5: No Firebase configuration is introduced during framework initialization.
  CHECK: node -e "const fs=require('fs'); if(fs.existsSync('firebase.json')||fs.existsSync('.firebaserc')) process.exit(1)"
  EXPECT: exit 0
  EVIDENCE: Neither `firebase.json` nor `.firebaserc` exists in this repository.
