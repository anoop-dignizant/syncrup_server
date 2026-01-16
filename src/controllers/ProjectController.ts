import { Request, Response } from 'express';
import { ProjectService } from '../services/ProjectService';
import { IndexerService } from '../services/IndexerService';
import { GraphService } from '../services/GraphService';
import { getIO } from '../services/SocketService';

const projectService = new ProjectService();

export class ProjectController {

    static async createProject(req: Request, res: Response) {
        try {
            const { name } = req.body;
            const project = await projectService.createProject(name);
            res.json(project);
        } catch (error) {
            res.status(500).json({ error: (error as Error).message });
        }
    }

    static async getProjects(req: Request, res: Response) {
        try {
            const projects = await projectService.getProjects();
            res.json(projects);
        } catch (error) {
            res.status(500).json({ error: (error as Error).message });
        }
    }

    static async addRepo(req: Request, res: Response) {
        try {
            const { projectId, name, url, type } = req.body;
            const repo = await projectService.addRepo(projectId, name, url, type);

            console.log(`[CONTROLLER] Repository added: ${repo.id} - ${name}`);
            console.log(`[CONTROLLER] Starting background indexing for project ${projectId}...`);

            // Get Socket.IO instance
            const io = getIO();

            // Emit repository added event
            io.emit('repository:added', { projectId, repository: repo });

            // Create project-specific graph service and indexer
            const graphService = new GraphService(projectId);
            const indexerService = new IndexerService(graphService);

            // Trigger indexing in background
            indexerService.cloneAndIndex(url, repo.id, repo.branch)
                .then(async () => {
                    console.log(`[CONTROLLER] ✅ Indexing successful for ${repo.id}, updating status to INDEXED`);
                    const updatedRepo = await projectService.updateRepoStatus(repo.id, 'INDEXED');

                    // Emit status update event
                    io.emit('repository:updated', { projectId, repository: updatedRepo });
                    io.emit('graph:updated', { projectId });
                })
                .then(() => {
                    console.log(`[CONTROLLER] ✓ Status updated to INDEXED for ${repo.id}`);
                })
                .catch(async (err) => {
                    console.error(`[CONTROLLER] ❌ Indexing failed for ${repo.id}:`, err);
                    const failedRepo = await projectService.updateRepoStatus(repo.id, 'FAILED');

                    // Emit failure event
                    io.emit('repository:updated', { projectId, repository: failedRepo });
                });

            res.json(repo);
        } catch (error) {
            res.status(500).json({ error: (error as Error).message });
        }
    }

    static async getGraph(req: Request, res: Response) {
        try {
            const { projectId } = req.query;
            const graphService = new GraphService(projectId as string);
            const graph = graphService.getGraph();
            res.json(graph);
        } catch (error) {
            res.status(500).json({ error: (error as Error).message });
        }
    }
}
