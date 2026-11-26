import {isAbsolute, relative, resolve} from 'node:path';
import ts from 'typescript';

export const GERMAN_REVIEW_MODE = 'german-review';

// These are UI copy tables. The paths identify values, never object keys,
// identifiers, English copy, or data from a source. An empty path list selects
// every string value in a table that contains only German copy.
const catalogs = {
  'uiLabels.ts': {publicSections: [], pageLabels: [], organTabs: []},
  'pageFaqContent.ts': {germanItems: [], germanSets: []},
  'specificationLabels.ts': {technicalFieldGerman: [], technicalGroupGerman: [], differenceGerman: ['*.1']},
  'PodExplorer.tsx': {familyGerman: [], filterGerman: [], optionGerman: [], familyGroups: ['*.de'], german: []},
  'vocabularyHub.tsx': {familyGerman: []},
  'publicApiGuide.tsx': {REST_EXAMPLES: ['*.label.1', '*.description.1']},
  'researchWorkbench.tsx': {WORKBENCH_VIEWS: ['*.de.*']},
  'researchFilters.tsx': {names: ['*.1']},
  'identityOccurrences.tsx': {occurrenceLabels: ['*.1']},
  'researchExploration.tsx': {dimensionGerman: []},
  'useCases.tsx': {STORIES: ['*.title.1', '*.summary.1', '*.category.1'], FIRE_TITLE: ['1'], COVERAGE_LABELS: [], ACTIVITY_LABELS: []},
  'organologicalResearch.tsx': {DOSSIER_GERMAN: []},
  'dalmatiaFireUseCase.tsx': {FIRE_BANDS_GERMAN: [], FIRE_LIMITATIONS_GERMAN: [], FIRE_SOURCE_ROLES_GERMAN: []},
  'workbenchLabels.ts': {EVIDENCE_TERMS: [], UNITS: ['*.1', '*.2']},
};

function isNamed(node, name) {
  return node && ts.isIdentifier(node) && node.text === name;
}

function tBinding(declaration, moduleName) {
  if (isNamed(declaration.name, 't')) {
    return !!declaration.type && ts.isTypeReferenceNode(declaration.type) && isNamed(declaration.type.typeName, 'UiText');
  }
  if (!ts.isObjectBindingPattern(declaration.name) || !declaration.name.elements.some(element => isNamed(element.name, 't'))) return undefined;
  const value = declaration.initializer;
  return !!value && (
    (ts.isCallExpression(value) && isNamed(value.expression, 'useUiLocale')) ||
    (moduleName === 'RouteBoundary.tsx' && ts.isPropertyAccessExpression(value) && value.expression.kind === ts.SyntaxKind.ThisKeyword && isNamed(value.name, 'props'))
  );
}

function findTBinding(node, moduleName, cache) {
  for (let scope = node.parent; scope; scope = scope.parent) {
    if (!cache.has(scope)) {
      const statements = ts.isBlock(scope) || ts.isSourceFile(scope) ? scope.statements : [];
      const declarations = ts.isFunctionLike(scope) ? scope.parameters
        : statements.filter(ts.isVariableStatement).flatMap(statement => [...statement.declarationList.declarations]);
      const binding = statements.some(statement => ts.isFunctionDeclaration(statement) && isNamed(statement.name, 't'))
        ? false : declarations.map(declaration => tBinding(declaration, moduleName)).find(value => value !== undefined);
      cache.set(scope, binding);
    }
    const binding = cache.get(scope);
    if (binding !== undefined) return binding;
  }
  return false;
}

function collectCatalogCopy(node, mark, slots, path = []) {
  if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node)) {
    collectCatalogCopy(node.expression, mark, slots, path);
  } else if (ts.isObjectLiteralExpression(node)) {
    for (const entry of node.properties) {
      if (ts.isPropertyAssignment(entry) && (ts.isIdentifier(entry.name) || ts.isStringLiteral(entry.name))) {
        collectCatalogCopy(entry.initializer, mark, slots, [...path, entry.name.text]);
      }
    }
  } else if (ts.isArrayLiteralExpression(node)) {
    node.elements.forEach((entry, index) => collectCatalogCopy(entry, mark, slots, [...path, String(index)]));
  } else if (ts.isStringLiteralLike(node) && (
    !slots.length || slots.some(slot => slot.length === path.length && slot.every((key, index) => key === '*' || key === path[index]))
  )) {
    // Truthiness is used for optional copy and key lookup. A short placeholder
    // keeps those decisions the same when the English formatter is active.
    if (node.text) mark(node, '" "');
  }
}

export function elideGermanPreviewCopy(code, moduleName) {
  if (!code.includes('uiLocale') && moduleName !== 'uiLocale.tsx') return null;
  const source = ts.createSourceFile(moduleName, code, ts.ScriptTarget.Latest, true);
  const localeModule = moduleName === 'uiLocale.tsx' || source.statements.some(node =>
    ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === './uiLocale');
  if (!localeModule) return null;
  const edits = [];
  const mark = (node, value) => edits.push([node.getStart(source), node.getEnd(), value]);
  const bindings = new WeakMap();
  const declarations = catalogs[moduleName];
  const visit = node => {
    if (ts.isCallExpression(node) && isNamed(node.expression, 't') &&
        node.arguments.length >= 3 && ts.isStringLiteralLike(node.arguments[2]) && findTBinding(node, moduleName, bindings)) {
      const [id, english, german] = node.arguments;
      // The English-only release can inline plain messages. Leave any values,
      // ICU syntax, rich tags, or dynamic message ID to the formatter.
      if (node.arguments.length === 3 && ts.isStringLiteralLike(id) && ts.isStringLiteralLike(english) && !/[{}<>']/u.test(english.text)) {
        mark(node, english.getText(source));
      } else {
        mark(german, '""');
      }
    }
    if (declarations && ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) &&
        Object.hasOwn(declarations, node.name.text) && node.initializer) {
      const slots = declarations[node.name.text].map(slot => slot.split('.'));
      collectCatalogCopy(node.initializer, mark, slots);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (!edits.length) return null;
  let result = code;
  for (const [start, end, value] of edits.sort(([left], [right]) => right - left)) {
    result = result.slice(0, start) + value + result.slice(end);
  }
  return result;
}

export function germanPreviewCopyPlugin(frontendRoot) {
  const sourceRoot = resolve(frontendRoot, 'src');
  let elide = false;
  return {
    name: 'modavis-elide-german-preview-copy',
    enforce: 'pre',
    config(config, {command, mode}) {
      elide = command === 'build' && mode !== GERMAN_REVIEW_MODE;
      if (mode === GERMAN_REVIEW_MODE && !config.build?.outDir) return {build: {outDir: '.runtime/german-review'}};
    },
    transform(code, id) {
      if (!elide) return null;
      const moduleName = relative(sourceRoot, id.split('?')[0]);
      if (moduleName.startsWith('..') || isAbsolute(moduleName) || !/\.tsx?$/.test(moduleName)) return null;
      return elideGermanPreviewCopy(code, moduleName.replaceAll('\\', '/'));
    },
  };
}
