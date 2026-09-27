/**
 * Babel plugin for cold-start profiling (FLYRIGHT_MODULE_TIMING=1 builds only,
 * see scripts/perf/README.md). Brackets every module's own top-level code with
 * a clock read, after its imports, so the recorded time is the module's SELF
 * time at load: what it does at import beyond requiring its dependencies. The
 * startup probe (src/services/startup-probe.ts) prints the totals.
 */
module.exports = function moduleTiming({ types: t }) {
  const root = process.cwd() + '/';
  return {
    name: 'flyright-module-timing',
    visitor: {
      Program: {
        exit(path, state) {
          const file = (state.filename || 'unknown').replace(root, '');
          const clock = () =>
            t.conditionalExpression(
              t.memberExpression(t.identifier('global'), t.identifier('nativePerformanceNow')),
              t.callExpression(t.memberExpression(t.identifier('global'), t.identifier('nativePerformanceNow')), []),
              t.callExpression(t.memberExpression(t.identifier('Date'), t.identifier('now')), []),
            );
          const start = t.variableDeclaration('var', [
            t.variableDeclarator(t.identifier('__flyrightMt0'), clock()),
          ]);
          // (global.__mtimes || (global.__mtimes = [])).push([file, now - start])
          const times = t.memberExpression(t.identifier('global'), t.identifier('__mtimes'));
          const end = t.expressionStatement(
            t.callExpression(
              t.memberExpression(
                t.logicalExpression('||', times, t.assignmentExpression('=', times, t.arrayExpression([]))),
                t.identifier('push'),
              ),
              [t.arrayExpression([t.stringLiteral(file), t.binaryExpression('-', clock(), t.identifier('__flyrightMt0'))])],
            ),
          );
          const body = path.get('body');
          let lastImport = -1;
          body.forEach((statement, i) => {
            if (statement.isImportDeclaration()) lastImport = i;
          });
          if (lastImport >= 0) body[lastImport].insertAfter(start);
          else path.unshiftContainer('body', start);
          path.pushContainer('body', end);
        },
      },
    },
  };
};
