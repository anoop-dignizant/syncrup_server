
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

async function listModels() {
    try {
        if (!process.env.GEMINI_API_KEY) {
            console.error('GEMINI_API_KEY is not set');
            return;
        }

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        // Accessing the model listing via the underlying API or just trying a standard model
        // The SDK doesn't always expose listModels directly in the main class in all versions, 
        // but let's try to just infer from a successful call or standard docs.
        // Actually, the SDK *does* allow fetching model info in newer versions, but if it's old it might not.

        // Let's try a strict "gemini-pro" again but with error printing to see if it's a key issue?
        // No, the error is 404 Not Found, which is model specific.

        console.log('Testing model availability...');

        const toTry = ['gemini-1.5-flash', 'gemini-1.0-pro', 'gemini-pro', 'gemini-1.5-pro'];

        for (const modelName of toTry) {
            console.log(`Checking ${modelName}...`);
            try {
                const model = genAI.getGenerativeModel({ model: modelName });
                const result = await model.generateContent('Hello');
                const response = await result.response;
                console.log(`✅ SUCCESS: ${modelName} is working. Response: ${response.text()}`);
                return; // Found a working one
            } catch (error) {
                console.log(`❌ FAILED: ${modelName} - ${(error as Error).message.split('\n')[0]}`);
            }
        }

    } catch (error) {
        console.error('Fatal error:', error);
    }
}

listModels();
