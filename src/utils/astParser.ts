
import fs from 'fs';
import path from 'path';
import * as parser from '@typescript-eslint/parser';
import { AST_NODE_TYPES } from '@typescript-eslint/types';
import { GraphNode, GraphEdge } from '../services/GraphService';

// Basic file traversal to find .ts/.js files
function getFiles(dir: string): string[] {
    const subdirs = fs.readdirSync(dir);
    const files: string[] = [];
    subdirs.forEach((file) => {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            if (file !== 'node_modules' && file !== '.git' && file !== 'dist' && file !== 'build') {
                files.push(...getFiles(fullPath));
            }
        } else {
            if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js') || file.endsWith('.jsx')) {
                files.push(fullPath);
            }
        }
    });
    return files;
}

// Resolve import path to actual file path
function resolveImportPath(importPath: string, currentFilePath: string, dirPath: string): string | null {
    // Skip node_modules imports
    if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
        return null;
    }

    const currentDir = path.dirname(currentFilePath);
    let resolvedPath = path.resolve(currentDir, importPath);

    // Try different extensions
    const extensions = ['.ts', '.tsx', '.js', '.jsx', ''];
    for (const ext of extensions) {
        const testPath = resolvedPath + ext;
        if (fs.existsSync(testPath) && fs.statSync(testPath).isFile()) {
            return path.relative(dirPath, testPath);
        }
    }

    // Try index files
    for (const ext of ['.ts', '.tsx', '.js', '.jsx']) {
        const indexPath = path.join(resolvedPath, `index${ext}`);
        if (fs.existsSync(indexPath)) {
            return path.relative(dirPath, indexPath);
        }
    }

    return null;
}

export async function parseRepo(dirPath: string, repoId: string): Promise<{ nodes: GraphNode[], edges: GraphEdge[] }> {
    const files = getFiles(dirPath);
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const fileMap = new Map<string, string>(); // relativePath -> fileNodeId

    console.log(`[PARSER] Found ${files.length} files to parse`);

    // First pass: Create all file nodes
    for (const file of files) {
        const relativePath = path.relative(dirPath, file);
        const fileNodeId = `${repoId}:${relativePath}`;

        nodes.push({
            id: fileNodeId,
            type: 'FILE',
            label: relativePath,
            metadata: { repoId }
        });

        fileMap.set(relativePath, fileNodeId);
    }

    // Second pass: Parse imports and create edges
    for (const file of files) {
        const relativePath = path.relative(dirPath, file);
        const fileNodeId = fileMap.get(relativePath)!;
        const content = fs.readFileSync(file, 'utf-8');

        try {
            const ast = parser.parse(content, {
                sourceType: 'module',
                ecmaFeatures: { jsx: true },
                range: true,
                loc: true,
            });

            // Simple AST traversal
            (ast.body as any[]).forEach((node: any) => {
                // Detect Functions
                if (node.type === AST_NODE_TYPES.FunctionDeclaration) {
                    if (node.id) {
                        const funcName = node.id.name;
                        const funcId = `${fileNodeId}:${funcName}`;
                        nodes.push({
                            id: funcId,
                            type: 'FUNCTION',
                            label: funcName,
                            metadata: { startLine: node.loc.start.line, endLine: node.loc.end.line }
                        });
                        edges.push({
                            source: fileNodeId,
                            target: funcId,
                            type: 'DEFINES'
                        });
                    }
                }

                // Detect Imports
                if (node.type === AST_NODE_TYPES.ImportDeclaration) {
                    const importPath = node.source.value;
                    const resolvedPath = resolveImportPath(importPath, file, dirPath);

                    if (resolvedPath && fileMap.has(resolvedPath)) {
                        const targetFileId = fileMap.get(resolvedPath)!;
                        edges.push({
                            source: fileNodeId,
                            target: targetFileId,
                            type: 'IMPORTS'
                        });
                        console.log(`[PARSER] ${relativePath} IMPORTS ${resolvedPath}`);
                    }
                }
            });

        } catch (e) {
            console.error(`Failed to parse ${file}:`, e);
        }
    }

    console.log(`[PARSER] Created ${nodes.length} nodes and ${edges.length} edges`);
    return { nodes, edges };
}
