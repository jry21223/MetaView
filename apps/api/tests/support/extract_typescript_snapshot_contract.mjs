import fs from "node:fs";
import ts from "typescript";

function fail(message) {
  throw new Error(`snapshot contract extraction failed: ${message}`);
}

function parseSource(path) {
  return ts.createSourceFile(
    path,
    fs.readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
}

function findVariable(source, name) {
  const matches = [];
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === name) {
        matches.push(declaration);
      }
    }
  }
  if (matches.length !== 1) {
    fail(`expected exactly one top-level variable named ${name}, found ${matches.length}`);
  }
  return matches[0];
}

function findTypeAlias(source, name) {
  const matches = source.statements.filter(
    (statement) => ts.isTypeAliasDeclaration(statement) && statement.name.text === name,
  );
  if (matches.length !== 1) {
    fail(`expected exactly one top-level type alias named ${name}, found ${matches.length}`);
  }
  return matches[0];
}

function arrayArgumentOfNewExpression(declaration, constructorName) {
  const initializer = declaration.initializer;
  if (
    !initializer ||
    !ts.isNewExpression(initializer) ||
    !ts.isIdentifier(initializer.expression) ||
    initializer.expression.text !== constructorName ||
    initializer.arguments?.length !== 1 ||
    !ts.isArrayLiteralExpression(initializer.arguments[0])
  ) {
    fail(`${declaration.name.getText()} must be initialized as new ${constructorName}([...])`);
  }
  return initializer.arguments[0];
}

function stringLiteralValues(array, declarationName) {
  return array.elements.map((element, index) => {
    if (!ts.isStringLiteral(element)) {
      fail(`${declarationName}[${index}] must be a string literal`);
    }
    return element.text;
  });
}

function agentSelfCheckKinds(path) {
  const source = parseSource(path);
  const declaration = findVariable(source, "SUPPORTED_FRONTEND_SNAPSHOT_KINDS");
  return stringLiteralValues(
    arrayArgumentOfNewExpression(declaration, "Set"),
    "SUPPORTED_FRONTEND_SNAPSHOT_KINDS",
  );
}

function agentIssueContracts(path) {
  const source = parseSource(path);
  const contracts = [];
  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "issue" &&
      node.arguments.length >= 3 &&
      ts.isStringLiteral(node.arguments[0]) &&
      ts.isStringLiteral(node.arguments[1])
    ) {
      contracts.push({
        code: node.arguments[0].text,
        severity: node.arguments[1].text,
        path_source: node.arguments[2].getText(source),
      });
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return contracts;
}

function webSnapshotKindUnion(path) {
  const source = parseSource(path);
  const alias = findTypeAlias(source, "SnapshotKind");
  if (!ts.isUnionTypeNode(alias.type)) {
    fail("SnapshotKind must remain a union of string literal types");
  }
  return alias.type.types.map((type, index) => {
    if (!ts.isLiteralTypeNode(type) || !ts.isStringLiteral(type.literal)) {
      fail(`SnapshotKind member ${index} must be a string literal type`);
    }
    return type.literal.text;
  });
}

function webRendererRegistryKinds(path) {
  const source = parseSource(path);
  const declaration = findVariable(source, "registry");
  const entries = arrayArgumentOfNewExpression(declaration, "Map");
  return entries.elements.map((entry, index) => {
    if (!ts.isArrayLiteralExpression(entry) || entry.elements.length !== 2) {
      fail(`registry entry ${index} must be a two-item tuple`);
    }
    const kind = entry.elements[0];
    if (!ts.isStringLiteral(kind)) {
      fail(`registry entry ${index} must use a string literal key`);
    }
    return kind.text;
  });
}

const [agentPath, webTypesPath, webRegistryPath] = process.argv.slice(2);
if (!agentPath || !webTypesPath || !webRegistryPath) {
  fail("expected agent self-check, web types, and web renderer registry paths");
}

process.stdout.write(
  JSON.stringify({
    agent_self_check: agentSelfCheckKinds(agentPath),
    agent_issue_contracts: agentIssueContracts(agentPath),
    web_snapshot_kind: webSnapshotKindUnion(webTypesPath),
    web_renderer_registry: webRendererRegistryKinds(webRegistryPath),
  }),
);
