import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { PrintDesign } from '@bookly/shared';
import { PrismaService } from '../prisma/prisma.service';

/**
 * CRUD for saved drag-and-drop print designs. A design is the @bookly/shared
 * `PrintDesign` JSON; this layer just persists/duplicates them and tracks which
 * one is the default for a (company, docKind).
 */
@Injectable()
export class PrintTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  list(companyId: string, docKind = 'invoice') {
    return this.prisma.printTemplate.findMany({
      where: { companyId, docKind },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
      select: {
        id: true,
        name: true,
        docKind: true,
        isDefault: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async get(companyId: string, id: string) {
    const tpl = await this.prisma.printTemplate.findFirst({
      where: { id, companyId },
    });
    if (!tpl) throw new NotFoundException('Template not found');
    return tpl;
  }

  create(
    companyId: string,
    data: { name: string; docKind?: string; design: Record<string, unknown> },
  ) {
    return this.prisma.printTemplate.create({
      data: {
        companyId,
        name: data.name,
        docKind: data.docKind ?? 'invoice',
        design: data.design as Prisma.InputJsonValue,
      },
    });
  }

  async update(
    companyId: string,
    id: string,
    data: { name?: string; design?: Record<string, unknown>; isDefault?: boolean },
  ) {
    const tpl = await this.get(companyId, id);
    if (data.isDefault) {
      // Only one default per (company, docKind).
      await this.prisma.printTemplate.updateMany({
        where: { companyId, docKind: tpl.docKind, isDefault: true },
        data: { isDefault: false },
      });
    }
    return this.prisma.printTemplate.update({
      where: { id: tpl.id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.design !== undefined ? { design: data.design as Prisma.InputJsonValue } : {}),
        ...(data.isDefault !== undefined ? { isDefault: data.isDefault } : {}),
      },
    });
  }

  async remove(companyId: string, id: string) {
    const tpl = await this.get(companyId, id);
    await this.prisma.printTemplate.delete({ where: { id: tpl.id } });
    return { deleted: true };
  }

  async duplicate(companyId: string, id: string) {
    const tpl = await this.get(companyId, id);
    return this.prisma.printTemplate.create({
      data: {
        companyId,
        name: `${tpl.name} (copy)`,
        docKind: tpl.docKind,
        design: tpl.design as Prisma.InputJsonValue,
      },
    });
  }

  async setDefault(companyId: string, id: string) {
    return this.update(companyId, id, { isDefault: true });
  }

  /**
   * The design flagged default for this (company, docKind), or null when the
   * company hasn't chosen a custom design — callers then fall back to the
   * built-in form-based renderer.
   */
  async getDefaultDesign(companyId: string, docKind = 'invoice'): Promise<PrintDesign | null> {
    const tpl = await this.prisma.printTemplate.findFirst({
      where: { companyId, docKind, isDefault: true },
      select: { design: true },
    });
    return tpl ? (tpl.design as unknown as PrintDesign) : null;
  }
}
