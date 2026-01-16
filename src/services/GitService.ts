import simpleGit, { SimpleGit } from 'simple-git';
import fs from 'fs';
import path from 'path';

export class GitService {
    private git: SimpleGit;

    constructor(private repoPath: string) {
        this.git = simpleGit(repoPath);
    }

    /**
     * Pull latest changes from remote
     */
    async pullLatestChanges(): Promise<void> {
        console.log(`[GIT] Pulling latest changes for ${this.repoPath}`);
        await this.git.pull();
    }

    /**
     * Get list of changed files between commits
     */
    async getChangedFiles(fromCommit: string, toCommit: string = 'HEAD'): Promise<string[]> {
        const diff = await this.git.diff(['--name-only', fromCommit, toCommit]);
        return diff.split('\n').filter(f => f.trim() !== '');
    }

    /**
     * Get file content at specific commit
     */
    async getFileContent(filePath: string, commitHash: string): Promise<string> {
        try {
            const content = await this.git.show([`${commitHash}:${filePath}`]);
            return content;
        } catch (error) {
            console.error(`[GIT] Failed to get file content for ${filePath} at ${commitHash}`);
            return '';
        }
    }

    /**
     * Get current HEAD commit hash
     */
    async getCurrentCommit(): Promise<string> {
        const log = await this.git.log(['-1']);
        return log.latest?.hash || '';
    }

    /**
     * Get diff for a specific file
     */
    async getFileDiff(filePath: string, fromCommit: string, toCommit: string = 'HEAD'): Promise<string> {
        return await this.git.diff([fromCommit, toCommit, '--', filePath]);
    }
}
