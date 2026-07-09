#!/usr/bin/env bash
set -e

echo "🚀 Starting Vercel compatibility fixes..."

# Ensure Node 24 is used
if [ -f package.json ]; then
node <<'EOF'
const fs = require('fs');

const pkg = JSON.parse(fs.readFileSync('package.json'));

pkg.engines = {
  ...(pkg.engines || {}),
  node: "24.x"
};

fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + "\n");
console.log("✔ package.json updated");
EOF
fi

# Remove deprecated eslint config from next.config.mjs
if [ -f next.config.mjs ]; then
node <<'EOF'
const fs = require('fs');

let cfg = fs.readFileSync('next.config.mjs','utf8');

cfg = cfg.replace(/eslint\s*:\s*\{[\s\S]*?\},?/g,'');

fs.writeFileSync('next.config.mjs', cfg);

console.log("✔ Removed deprecated eslint config");
EOF
fi

# Reinstall dependencies
rm -rf node_modules
rm -f pnpm-lock.yaml

corepack enable
corepack prepare pnpm@10 --activate

pnpm install

# Type checking
pnpm exec tsc --noEmit || true

# Build locally
pnpm build

echo ""
echo "✅ Finished."
echo "If pnpm build succeeds, commit and push:"
echo ""
echo "git add ."
echo "git commit -m 'Fix Vercel deployment'"
echo "git push"
