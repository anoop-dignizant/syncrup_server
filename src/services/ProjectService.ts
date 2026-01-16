
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class ProjectService {
    async createProject(name: string) {
        return prisma.project.create({
            data: { name },
        });
    }

    async getProjects() {
        return prisma.project.findMany({
            include: { repos: true },
        });
    }

    async addRepo(projectId: string, name: string, url: string, type: 'SERVER' | 'WEB' | 'MOBILE') {
        return prisma.repository.create({
            data: {
                projectId,
                name,
                url,
                type,
                status: 'PENDING',
            },
        });
    }

    async getRepo(id: string) {
        return prisma.repository.findUnique({
            where: { id },
        });
    }

    async updateRepoStatus(id: string, status: string) {
        return prisma.repository.update({
            where: { id },
            data: { status },
        });
    }
}
