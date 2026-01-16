
import dotenv from 'dotenv';

dotenv.config();

async function listModelsRaw() {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
        console.error('No API Key found');
        return;
    }

    try {
        console.log('Querying Gemini API for available models...');
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;

        const response = await fetch(url);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(`API Error: ${response.status} ${response.statusText} - ${JSON.stringify(data)}`);
        }

        const models = (data as any).models;
        if (models && Array.isArray(models)) {
            console.log('\n✅ Available Models:');
            models.forEach((m: any) => {
                if (m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent')) {
                    console.log(`- ${m.name}`);
                }
            });
        } else {
            console.log('No models found in response or unexpected format.');
            console.log(JSON.stringify(data, null, 2));
        }

    } catch (error) {
        console.error('❌ Error fetching models:', (error as Error).message);
    }
}

listModelsRaw();
