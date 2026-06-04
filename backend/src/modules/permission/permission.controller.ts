import type { Request, Response } from 'express';
import { permissionService } from './permission.service.js';
import type { AssignRoleInput, CreateRoleInput, SetRolePermissionsInput } from './permission.schemas.js';

/** Route params are always strings; narrow Express 5's string|string[] type. */
function param(req: Request, name: string): string {
  return String(req.params[name]);
}

export const permissionController = {
  async listPermissions(_req: Request, res: Response): Promise<void> {
    const permissions = await permissionService.listPermissions();
    res.json({ permissions });
  },

  async listRoles(_req: Request, res: Response): Promise<void> {
    const roles = await permissionService.listRoles();
    res.json({ roles });
  },

  async createRole(req: Request, res: Response): Promise<void> {
    const role = await permissionService.createRole(req.body as CreateRoleInput);
    res.status(201).json({ role });
  },

  async deleteRole(req: Request, res: Response): Promise<void> {
    await permissionService.deleteRole(param(req, 'roleId'));
    res.json({ ok: true });
  },

  async setRolePermissions(req: Request, res: Response): Promise<void> {
    const { permissionIds } = req.body as SetRolePermissionsInput;
    await permissionService.setRolePermissions(param(req, 'roleId'), permissionIds);
    res.json({ ok: true });
  },

  async assignRole(req: Request, res: Response): Promise<void> {
    const { roleId } = req.body as AssignRoleInput;
    await permissionService.assignRole(param(req, 'userId'), roleId);
    res.json({ ok: true });
  },

  async removeRole(req: Request, res: Response): Promise<void> {
    await permissionService.removeRole(param(req, 'userId'), param(req, 'roleId'));
    res.json({ ok: true });
  },

  async getUserPermissions(req: Request, res: Response): Promise<void> {
    const permissions = await permissionService.computeEffectivePermissions(param(req, 'userId'));
    res.json({ userId: param(req, 'userId'), permissions });
  },
};
