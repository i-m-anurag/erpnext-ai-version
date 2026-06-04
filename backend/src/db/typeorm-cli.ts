/**
 * Wrapper so the TypeORM CLI runs under tsx (TS + ESM) regardless of whether
 * the `typeorm` package is hoisted to the workspace root or installed locally.
 * Resolving by package subpath avoids hardcoding a node_modules path.
 */
import 'typeorm/cli.js';
