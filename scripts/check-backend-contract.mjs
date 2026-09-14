/** Read-only release check: every client API reference must exist in the
 * selected deployment. Never call mutations or print deployment credentials. */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';

export const root = fileURLToPath(new URL('../', import.meta.url));

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.[jt]sx?$/.test(entry.name) && !/\.(test|spec|d)\.[jt]sx?$/.test(entry.name) ? [path] : [];
  });
}

export function referencesInSource(source, filename = 'source.tsx') {
  const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
  const aliases = new Set();
  for (const node of ast.statements) {
    if (!ts.isImportDeclaration(node) || !node.moduleSpecifier.text.endsWith('/_generated/api')) continue;
    const bindings = node.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const binding of bindings.elements) {
        if ((binding.propertyName?.text ?? binding.name.text) === 'api') aliases.add(binding.name.text);
      }
    }
  }
  const found = new Set();
  const chain = node => {
    if (ts.isIdentifier(node)) return [node.text];
    if (ts.isPropertyAccessExpression(node)) return [...chain(node.expression), node.name.text];
    if (ts.isElementAccessExpression(node) && ts.isStringLiteral(node.argumentExpression)) {
      return [...chain(node.expression), node.argumentExpression.text];
    }
    return [];
  };
  function visit(node) {
    if (ts.isTypeNode(node)) return;
    if (ts.isIdentifier(node) && aliases.has(node.text) && node.parent && !ts.isImportSpecifier(node.parent)) {
      let access = node;
      while ((ts.isPropertyAccessExpression(access.parent) || ts.isElementAccessExpression(access.parent)) && access.parent.expression === access) access = access.parent;
      const parts = chain(access);
      if (parts.length < 3 || parts[0] !== node.text) {
        throw new Error(`${filename}: API reference cannot be resolved statically; use api.module.function`);
      }
      found.add(`${parts.slice(1, -1).join('/')}:${parts.at(-1)}`);
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return [...found].sort();
}

export function collectReferences(directory = resolve(root, 'src')) {
  const references = new Map();
  for (const path of sourceFiles(directory)) {
    for (const name of referencesInSource(readFileSync(path, 'utf8'), relative(root, path))) {
      references.set(name, [...(references.get(name) ?? []), relative(root, path)]);
    }
  }
  if (!references.size) throw new Error('No client API references found; refusing an empty check');
  return references;
}

export function checkContract(references, spec, expectedUrl) {
  if (spec.url !== expectedUrl || !Array.isArray(spec.functions)) throw new Error('Unexpected deployment URL or malformed function metadata');
  const publicFunctions = new Set(spec.functions.filter(fn => fn.visibility?.kind === 'public')
    .map(fn => fn.identifier.replace(/\.js:/, ':')));
  const missing = [...references.keys()].filter(name => !publicFunctions.has(name));
  if (missing.length) throw new Error(`Backend is missing client functions:\n${missing.map(name => `  ${name} (${references.get(name).join(', ')})`).join('\n')}\nDeploy the backend before building or promoting this release.`);
  return { deployment: spec.url, checked: references.size };
}

export function verifyBackend(deployment = 'prod') {
  if (!['prod', 'dev'].includes(deployment)) throw new Error('Use --prod or --dev');
  const urls = { prod: 'https://limitless-oyster-269.convex.cloud', dev: 'https://watchful-swordfish-508.convex.cloud' };
  const result = spawnSync(process.execPath, ['node_modules/convex/bin/main.js', 'function-spec', '--deployment', deployment], {
    cwd: root, encoding: 'utf8', timeout: 90_000, maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --dns-result-order=ipv4first --no-network-family-autoselection` },
  });
  if (result.error || result.status !== 0) throw new Error(`Could not inspect the ${deployment} backend. Check Convex login/network access; this check has not passed.`);
  const report = checkContract(collectReferences(), JSON.parse(result.stdout), urls[deployment]);
  console.log(`Backend check passed: ${report.checked} client functions are deployed on ${deployment}.`);
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 1 || !['--prod', '--dev'].includes(args[0])) throw new Error('Usage: node scripts/check-backend-contract.mjs --prod|--dev');
    verifyBackend(args[0].slice(2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
