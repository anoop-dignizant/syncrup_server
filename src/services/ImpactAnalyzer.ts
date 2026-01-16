import { GraphService } from './GraphService';
import { AIService } from './AIService';
import path from 'path';

export interface ImpactResult {
    projectId: string;
    changedFile: string;
    changedRepo: string;
    affectedFiles: Array<{
        repoId: string;
        filePath: string;
        reason: string;
    }>;
    isBreaking: boolean;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    explanation: string;
    timestamp: string;
}

export class ImpactAnalyzer {
    private aiService: AIService;

    constructor() {
        this.aiService = new AIService();
    }

    /**
     * Analyze impact of a file change
     */
    async analyzeFileChange(
        projectId: string,
        repoId: string,
        filePath: string,
        oldContent?: string,
        newContent?: string
    ): Promise<ImpactResult> {
        console.log(`[IMPACT] Analyzing impact for ${filePath} in repo ${repoId}`);

        // Load project graph
        const graphService = new GraphService(projectId);
        const graph = graphService.getGraph();

        // Normalize file path (handle both / and \)
        const normalizedPath = filePath.replace(/\\/g, '/');

        // Try multiple node ID formats
        const possibleNodeIds = [
            `${repoId}:${normalizedPath}`,
            `${repoId}:${filePath}`,
            `${repoId}:${filePath.replace(/\//g, '\\')}`,
        ];

        console.log(`[IMPACT] Looking for node IDs:`, possibleNodeIds);

        // Find the changed file node
        let changedNode = null;
        let changedNodeId = '';

        for (const nodeId of possibleNodeIds) {
            changedNode = graph.nodes.find(n => n.id === nodeId);
            if (changedNode) {
                changedNodeId = nodeId;
                console.log(`[IMPACT] Found node with ID: ${nodeId}`);
                break;
            }
        }

        if (!changedNode) {
            console.log(`[IMPACT] Changed file not found in graph. Available nodes:`,
                graph.nodes.filter(n => n.id.includes(repoId)).map(n => n.id).slice(0, 5));
            return this.createEmptyResult(projectId, repoId, filePath);
        }

        // Find all files that depend on this file (reverse dependencies from graph)
        const graphAffectedFiles = this.findAffectedFiles(graph, changedNodeId, repoId);

        // AI-powered analysis: Single call to get both changed functions and severtiy
        let semanticAffectedFiles: Array<{ repoId: string; filePath: string; reason: string }> = [];
        let isBreaking = false;
        let explanation = 'File modified';

        if (oldContent && newContent) {
            console.log('[IMPACT-AI] Sending consolidated prompt to AI...');

            const prompt = `Analyze these code changes and provide two things:
1. A list of changed function names (added, modified, or removed).
2. Whether this is a breaking API change.

STRICT DEFINITION OF BREAKING CHANGE:
- Renaming an exported function.
- Changing the runtime structure of the return value (e.g., returning an object instead of an array).
- Adding a required argument.
- Removing an argument.

NON-BREAKING CHANGES (DO NOT REPORT AS BREAKING):
- Changing a specific type to 'any' or 'unknown' (Type widening is NOT breaking).
- Adding an optional argument.
- Internal logic changes that do not affect the output structure.
- Refactoring or code cleanup.

OLD CODE:
\`\`\`
${oldContent.substring(0, 2000)}
\`\`\`

NEW CODE:
\`\`\`
${newContent.substring(0, 2000)}
\`\`\`

Respond ONLY with valid JSON in this format:
{
  "changedFunctions": ["funcName1", "funcName2"],
  "isBreaking": true/false,
  "explanation": "Brief explanation of why it is breaking or not"
}
If no functions changed, set "changedFunctions" to [].`;

            try {
                const aiResponse = await this.aiService.generateContent(prompt);
                console.log('[IMPACT-AI] Raw Response:', aiResponse);

                // Extract JSON
                const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const result = JSON.parse(jsonMatch[0]);
                    isBreaking = result.isBreaking || false;
                    explanation = result.explanation || 'Analyzed by AI';

                    const changedFunctions = result.changedFunctions || [];
                    console.log('[IMPACT-AI] Parsed changed functions:', changedFunctions);

                    if (changedFunctions.length > 0) {
                        semanticAffectedFiles = await this.searchForAffectedFiles(
                            graph,
                            repoId,
                            changedFunctions
                        );
                    }
                }
            } catch (err) {
                console.error('[IMPACT-AI] Analysis failed:', err);
            }
        }

        // Combine both types of affected files
        const allAffectedFiles = [...graphAffectedFiles, ...semanticAffectedFiles];

        // Remove duplicates
        const uniqueAffectedFiles = Array.from(
            new Map(allAffectedFiles.map(f => [`${f.repoId}:${f.filePath}`, f])).values()
        );





        if (!isBreaking) {
            console.log('[IMPACT] Change classified as non-breaking. Ignoring affected files as per configuration.');
            return {
                projectId,
                changedFile: filePath,
                changedRepo: repoId,
                affectedFiles: [],
                isBreaking,
                severity: 'LOW',
                explanation: explanation || 'Non-breaking change detected',
                timestamp: new Date().toISOString()
            };
        }

        // Determine severity
        const severity = this.determineSeverity(uniqueAffectedFiles.length, isBreaking);

        console.log(`[IMPACT] Found ${uniqueAffectedFiles.length} total affected files (${graphAffectedFiles.length} from graph + ${semanticAffectedFiles.length} from AI), Breaking: ${isBreaking}, Severity: ${severity}`);

        uniqueAffectedFiles.forEach(f => {
            console.log(`  > Affected: ${f.filePath} [${f.reason}]`);
        });

        return {
            projectId,
            changedFile: filePath,
            changedRepo: repoId,
            affectedFiles: uniqueAffectedFiles,
            isBreaking,
            severity,
            explanation,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Search for files that use the changed functions
     */
    private async searchForAffectedFiles(
        graph: any,
        sourceRepoId: string,
        changedFunctions: string[]
    ): Promise<Array<{ repoId: string; filePath: string; reason: string }>> {
        console.log(`[IMPACT-AI] Scanning for usages of: ${changedFunctions.join(', ')}`);

        // Filter valid function names to avoid false positives
        const functionList = changedFunctions.map(f => f.trim()).filter(f => f.length > 2);

        if (functionList.length === 0) return [];

        // Get all files from other repositories
        const otherRepoFiles = graph.nodes.filter((n: any) =>
            n.type === 'FILE' &&
            !n.id.startsWith(sourceRepoId) &&
            n.id.match(/\.(ts|tsx|js|jsx)$/)
        );

        const affectedFiles: Array<{ repoId: string; filePath: string; reason: string }> = [];

        // Check a sample of files
        for (const file of otherRepoFiles.slice(0, 50)) {
            const [fileRepoId, ...pathParts] = file.id.split(':');
            const filePathStr = pathParts.join(':');

            try {
                const repoPath = path.join(process.cwd(), 'repos', fileRepoId);
                const normalizedFilePath = filePathStr.replace(/\\/g, path.sep).replace(/\//g, path.sep);
                const absoluteFilePath = path.join(repoPath, normalizedFilePath);

                const fs = require('fs');
                if (!fs.existsSync(absoluteFilePath)) continue;

                const fileContent = fs.readFileSync(absoluteFilePath, 'utf-8');
                const lines = fileContent.split('\n');
                const usages: string[] = [];

                for (const fn of functionList) {
                    if (fileContent.includes(fn)) {
                        for (let i = 0; i < lines.length; i++) {
                            if (lines[i].includes(fn)) {
                                usages.push(`${fn} (line ${i + 1})`);
                                break;
                            }
                        }
                    }
                }

                if (usages.length > 0) {
                    affectedFiles.push({
                        repoId: fileRepoId,
                        filePath: filePathStr,
                        reason: `Uses modified functions: ${usages.join(', ')}`
                    });
                }
            } catch (err) {
                // Ignore file read errors
            }
        }

        return affectedFiles;
    }

    /**
     * Find all files affected by a change
     */
    private findAffectedFiles(graph: any, changedNodeId: string, sourceRepoId: string) {
        const affected: Array<{ repoId: string; filePath: string; reason: string }> = [];
        const visited = new Set<string>();

        // BFS to find all dependent files
        const queue = [changedNodeId];
        visited.add(changedNodeId);

        while (queue.length > 0) {
            const currentNodeId = queue.shift()!;

            // Find all edges where current node is the target (reverse dependency)
            const dependentEdges = graph.edges.filter((e: any) => e.target === currentNodeId && e.type === 'IMPORTS');

            for (const edge of dependentEdges) {
                if (!visited.has(edge.source)) {
                    visited.add(edge.source);
                    queue.push(edge.source);

                    // Extract repo and file path
                    const [edgeRepoId, ...pathParts] = edge.source.split(':');
                    const edgeFilePath = pathParts.join(':');

                    // Only include files from different repos
                    if (edgeRepoId !== sourceRepoId) {
                        const node = graph.nodes.find((n: any) => n.id === edge.source);
                        affected.push({
                            repoId: edgeRepoId,
                            filePath: edgeFilePath,
                            reason: `Imports ${path.basename(changedNodeId)}`
                        });
                    }
                }
            }
        }

        return affected;
    }

    /**
     * Determine severity based on impact
     */
    private determineSeverity(affectedCount: number, isBreaking: boolean): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
        if (isBreaking && affectedCount > 5) return 'CRITICAL';
        if (isBreaking && affectedCount > 0) return 'HIGH';
        if (affectedCount > 10) return 'HIGH';
        if (affectedCount > 5) return 'MEDIUM';
        return 'LOW';
    }

    /**
     * Create empty result when file not found
     */
    private createEmptyResult(projectId: string, repoId: string, filePath: string): ImpactResult {
        return {
            projectId,
            changedFile: filePath,
            changedRepo: repoId,
            affectedFiles: [],
            isBreaking: false,
            severity: 'LOW',
            explanation: 'File not found in dependency graph',
            timestamp: new Date().toISOString()
        };
    }
}
