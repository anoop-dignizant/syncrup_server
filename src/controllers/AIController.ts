import { Request, Response } from 'express';
import { AIService } from '../services/AIService';

const aiService = new AIService();

export class AIController {

    /**
     * POST /ai/enrich
     * Body: { nodeId, nodeType, label, context }
     */
    static async enrichNode(req: Request, res: Response) {
        try {
            const result = await aiService.enrichNode(req.body);
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: (error as Error).message });
        }
    }

    /**
     * POST /ai/analyze-impact
     * Body: { changedFiles, graphContext }
     */
    static async analyzeImpact(req: Request, res: Response) {
        try {
            const result = await aiService.analyzeImpact(req.body);
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: (error as Error).message });
        }
    }

    /**
     * POST /ai/classify-change
     * Body: { oldSignature, newSignature }
     */
    static async classifyChange(req: Request, res: Response) {
        try {
            const { oldSignature, newSignature } = req.body;
            const result = await aiService.classifyChange(oldSignature, newSignature);
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: (error as Error).message });
        }
    }
}
