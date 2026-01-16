
import simpleGit from 'simple-git';
import path from 'path';
import fs from 'fs';
import { GraphService, GraphNode, GraphEdge } from './GraphService';
import { parseRepo } from '../utils/astParser';

const REPO_DIR = path.join(process.cwd(), 'repos');

export class IndexerService {
    private graphService: GraphService;

    constructor(graphService: GraphService) {
        this.graphService = graphService;
        if (!fs.existsSync(REPO_DIR)) {
            fs.mkdirSync(REPO_DIR, { recursive: true });
        }
    }

    async cloneAndIndex(repoUrl: string, repoId: string, branch?: string) {
        console.log(`\n========================================`);
        console.log(`[INDEXER] Starting indexing for repo: ${repoId}`);
        console.log(`[INDEXER] URL: ${repoUrl}`);
        console.log(`[INDEXER] Branch: ${branch || 'auto-detect'}`);
        console.log(`========================================\n`);

        const localPath = path.join(REPO_DIR, repoId);

        try {
            // 1. Clone or Pull
            if (fs.existsSync(localPath)) {
                console.log(`[INDEXER] Repo ${repoId} exists locally, pulling latest...`);
                const git = simpleGit(localPath);
                await git.pull();
                console.log(`[INDEXER] ✓ Pull completed`);
            } else {
                console.log(`[INDEXER] Cloning ${repoUrl} to ${localPath}...`);
                const startClone = Date.now();
                await simpleGit().clone(repoUrl, localPath);
                const cloneTime = ((Date.now() - startClone) / 1000).toFixed(2);
                console.log(`[INDEXER] ✓ Clone completed in ${cloneTime}s`);
            }

            // 2. Checkout branch (detect default branch if not specified)
            console.log(`[INDEXER] Checking out branch...`);
            const git = simpleGit(localPath);

            if (!branch) {
                // Get the current/default branch
                const status = await git.status();
                branch = status.current || 'main';
                console.log(`[INDEXER] Auto-detected branch: ${branch}`);
            }

            // Check if branch exists before checking out
            try {
                const branches = await git.branch();
                console.log(`[INDEXER] Available branches: ${branches.all.join(', ')}`);

                if (branches.all.includes(branch) || branches.all.includes(`origin/${branch}`)) {
                    await git.checkout(branch);
                    console.log(`[INDEXER] ✓ Checked out branch: ${branch}`);
                } else {
                    const currentBranch = (await git.status()).current;
                    console.log(`[INDEXER] ⚠ Branch ${branch} not found, using current branch: ${currentBranch}`);
                }
            } catch (error) {
                console.log(`[INDEXER] ⚠ Could not checkout branch ${branch}, continuing with current branch`);
                console.error(`[INDEXER] Error:`, error);
            }

            // 3. Parse AST and Build Graph
            console.log(`[INDEXER] Starting AST parsing for ${localPath}...`);
            const startParse = Date.now();
            const { nodes, edges } = await parseRepo(localPath, repoId);
            const parseTime = ((Date.now() - startParse) / 1000).toFixed(2);
            console.log(`[INDEXER] ✓ Parsing completed in ${parseTime}s`);
            console.log(`[INDEXER] Found ${nodes.length} nodes and ${edges.length} edges`);

            // 4. Save to GraphService
            console.log(`[INDEXER] Saving to graph database...`);
            nodes.forEach((n: GraphNode) => this.graphService.addNode(n));
            edges.forEach((e: GraphEdge) => this.graphService.addEdge(e));
            this.graphService.save();
            console.log(`[INDEXER] ✓ Graph saved successfully`);

            console.log(`\n========================================`);
            console.log(`[INDEXER] ✅ INDEXING COMPLETED for ${repoId}`);
            console.log(`[INDEXER] Total nodes: ${nodes.length}, Total edges: ${edges.length}`);
            console.log(`========================================\n`);

            return { nodesCount: nodes.length, edgesCount: edges.length };
        } catch (error) {
            console.error(`\n========================================`);
            console.error(`[INDEXER] ❌ INDEXING FAILED for ${repoId}`);
            console.error(`[INDEXER] Error:`, error);
            console.error(`========================================\n`);
            throw error;
        }
    }
}
