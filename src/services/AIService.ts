import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = process.env.GEMINI_API_KEY
    ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    : null;

export interface EnrichmentRequest {
    nodeId: string;
    nodeType: string;
    label: string;
    context?: string;
}

export interface EnrichmentResult {
    nodeId: string;
    description: string;
    criticality: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    riskLevel: number; // 0-10
    tags: string[];
}

export interface ImpactAnalysisRequest {
    changedFiles: string[];
    graphContext: any; // Simplified graph structure
}

export interface ImpactAnalysisResult {
    affectedNodes: string[];
    impactPaths: Array<{
        path: string[];
        explanation: string;
        riskLevel: number;
    }>;
    summary: string;
}

export class AIService {

    /**
     * Enrich a graph node with AI-generated metadata
     * AI ONLY receives structured summaries, NOT raw code
     */
    async enrichNode(request: EnrichmentRequest): Promise<EnrichmentResult> {
        if (!genAI) {
            console.warn('Gemini API key not configured. Skipping enrichment.');
            return {
                nodeId: request.nodeId,
                description: 'No AI enrichment available',
                criticality: 'MEDIUM',
                riskLevel: 5,
                tags: [],
            };
        }

        const prompt = `
You are a code analysis assistant. Given the following code element, provide enrichment metadata.

Node Type: ${request.nodeType}
Label: ${request.label}
Context: ${request.context || 'N/A'}

Respond ONLY with valid JSON matching this schema:
{
  "description": "Brief description of what this element does",
  "criticality": "LOW | MEDIUM | HIGH | CRITICAL",
  "riskLevel": 0-10,
  "tags": ["tag1", "tag2"]
}
`;

        try {
            const model = genAI.getGenerativeModel({ model: 'gemini-flash-latest' });
            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();

            // Extract JSON from markdown code blocks if present
            let jsonText = text;
            const jsonMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
            if (jsonMatch) {
                jsonText = jsonMatch[1];
            }

            const parsed = JSON.parse(jsonText);

            return {
                nodeId: request.nodeId,
                description: parsed.description || 'Unknown',
                criticality: parsed.criticality || 'MEDIUM',
                riskLevel: parsed.riskLevel || 5,
                tags: parsed.tags || [],
            };
        } catch (error) {
            console.error('AI enrichment failed:', error);
            return {
                nodeId: request.nodeId,
                description: 'Enrichment failed',
                criticality: 'MEDIUM',
                riskLevel: 5,
                tags: [],
            };
        }
    }

    /**
     * Analyze the impact of code changes
     * AI receives ONLY structured graph summaries, NOT raw files
     */
    async analyzeImpact(request: ImpactAnalysisRequest): Promise<ImpactAnalysisResult> {
        if (!genAI) {
            console.warn('Gemini API key not configured. Skipping impact analysis.');
            return {
                affectedNodes: [],
                impactPaths: [],
                summary: 'No AI analysis available',
            };
        }

        const prompt = `
You are a code impact analysis assistant. Given the following changed files and dependency graph context, analyze the impact.

Changed Files:
${request.changedFiles.join('\n')}

Graph Context (simplified):
${JSON.stringify(request.graphContext, null, 2)}

Respond ONLY with valid JSON matching this schema:
{
  "affectedNodes": ["nodeId1", "nodeId2"],
  "impactPaths": [
    {
      "path": ["nodeA", "nodeB", "nodeC"],
      "explanation": "Why this path is affected",
      "riskLevel": 0-10
    }
  ],
  "summary": "Overall impact summary"
}
`;

        try {
            const model = genAI.getGenerativeModel({ model: 'gemini-flash-latest' });
            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();

            // Extract JSON from markdown code blocks if present
            let jsonText = text;
            const jsonMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
            if (jsonMatch) {
                jsonText = jsonMatch[1];
            }

            const parsed = JSON.parse(jsonText);

            return {
                affectedNodes: parsed.affectedNodes || [],
                impactPaths: parsed.impactPaths || [],
                summary: parsed.summary || 'No impact detected',
            };
        } catch (error) {
            console.error('AI impact analysis failed:', error);
            return {
                affectedNodes: [],
                impactPaths: [],
                summary: 'Analysis failed',
            };
        }
    }

    /**
     * Classify whether a change is breaking or non-breaking
     */
    async classifyChange(oldSignature: string, newSignature: string): Promise<{ isBreaking: boolean; explanation: string }> {
        if (!genAI) {
            return { isBreaking: false, explanation: 'No AI available' };
        }

        const prompt = `
Compare these two function signatures and determine if the change is breaking.

Old: ${oldSignature}
New: ${newSignature}

Respond ONLY with valid JSON:
{
  "isBreaking": true/false,
  "explanation": "Brief explanation"
}
`;

        try {
            const model = genAI.getGenerativeModel({ model: 'gemini-flash-latest' });
            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();

            // Extract JSON from markdown code blocks if present
            let jsonText = text;
            const jsonMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
            if (jsonMatch) {
                jsonText = jsonMatch[1];
            }

            const parsed = JSON.parse(jsonText);

            return {
                isBreaking: parsed.isBreaking || false,
                explanation: parsed.explanation || 'Unknown',
            };
        } catch (error) {
            console.error('AI classification failed:', error);
            return { isBreaking: false, explanation: 'Classification failed' };
        }
    }

    /**
     * Generic method to generate content using AI with retry logic
     */
    async generateContent(prompt: string, retries = 3): Promise<string> {
        if (!genAI) {
            return '';
        }

        const modelName = 'gemini-flash-latest';

        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const model = genAI.getGenerativeModel({ model: modelName });
                const result = await model.generateContent(prompt);
                const response = await result.response;
                return response.text();
            } catch (error: any) {
                const isRateLimit = error.message?.includes('429') || error.status === 429;

                if (isRateLimit && attempt < retries) {
                    const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
                    console.warn(`[AI] Rate limit hit. Retrying in ${delay}ms (Attempt ${attempt}/${retries})...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }

                console.error(`[AI] Generation failed (Attempt ${attempt}):`, error.message);
                if (attempt === retries) return '';
            }
        }
        return '';
    }
}
