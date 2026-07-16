import { Injectable, NotFoundException } from '@nestjs/common';
import { TaskPriority } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Personal editorial to-dos ("My tasks"). Strictly per-user: every query is
 * scoped to the caller, so one editor can never read or touch another's
 * checklist.
 */
@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    const tasks = await this.prisma.editorialTask.findMany({
      where: { userId },
      // Open tasks first, nearest deadline on top; deadline-less sink below.
      orderBy: [{ done: 'asc' }, { deadline: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: 100,
    });
    return tasks.map((t) => this.serialize(t));
  }

  async create(userId: string, input: { title: string; deadline?: string | null; priority?: string | null }) {
    const task = await this.prisma.editorialTask.create({
      data: {
        userId,
        title: input.title.trim(),
        deadline: input.deadline ? new Date(input.deadline) : null,
        priority: this.toPriority(input.priority),
      },
    });
    return this.serialize(task);
  }

  async update(
    userId: string,
    id: string,
    input: { title?: string; done?: boolean; deadline?: string | null; priority?: string | null },
  ) {
    await this.assertOwned(userId, id);
    const task = await this.prisma.editorialTask.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title.trim() } : {}),
        ...(input.done !== undefined ? { done: input.done } : {}),
        ...(input.deadline !== undefined
          ? { deadline: input.deadline ? new Date(input.deadline) : null }
          : {}),
        ...(input.priority !== undefined ? { priority: this.toPriority(input.priority) } : {}),
      },
    });
    return this.serialize(task);
  }

  async remove(userId: string, id: string) {
    await this.assertOwned(userId, id);
    await this.prisma.editorialTask.delete({ where: { id } });
    return { deleted: true, id };
  }

  private async assertOwned(userId: string, id: string) {
    const task = await this.prisma.editorialTask.findFirst({ where: { id, userId }, select: { id: true } });
    if (!task) throw new NotFoundException('Task not found');
  }

  private toPriority(value?: string | null): TaskPriority {
    return value && value in TaskPriority ? (value as TaskPriority) : 'normal';
  }

  private serialize(t: {
    id: string;
    title: string;
    done: boolean;
    deadline: Date | null;
    priority: TaskPriority;
    createdAt: Date;
  }) {
    return {
      id: t.id,
      title: t.title,
      done: t.done,
      deadline: t.deadline?.toISOString() ?? null,
      priority: t.priority,
      createdAt: t.createdAt.toISOString(),
    };
  }
}
