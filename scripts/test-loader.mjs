import { registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// Mesmo TS/TSX do aplicativo, incluindo imports relativos sem extensão.
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('.') && context.parentURL) {
      const url = new URL(specifier, context.parentURL);
      if (!/\.[a-z]+$/i.test(url.pathname)) {
        for (const extension of ['.ts', '.tsx', '/index.ts']) {
          const candidate = new URL(url);
          candidate.pathname += extension;
          if (existsSync(fileURLToPath(candidate))) return next(candidate.href, context);
        }
      }
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.startsWith('file:') && /\.tsx?$/.test(new URL(url).pathname) && !url.includes('/node_modules/')) {
      const fileName = fileURLToPath(url);
      return {
        format: 'module', shortCircuit: true,
        source: ts.transpileModule(readFileSync(fileName, 'utf8'), {
          fileName,
          compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
        }).outputText,
      };
    }
    return next(url, context);
  },
});
