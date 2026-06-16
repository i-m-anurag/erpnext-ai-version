import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, type Observable } from 'rxjs';

export interface RoleOption {
  id: string;
  code: string;
  name: string;
}

/** Lists roles (for workflow role pickers — trigger roles, assignment target). */
@Injectable({ providedIn: 'root' })
export class RolesApiService {
  private readonly http = inject(HttpClient);

  list(): Observable<RoleOption[]> {
    return this.http
      .get<{ roles: RoleOption[] }>('/api/permissions/roles')
      .pipe(map((r) => r.roles.map((x) => ({ id: x.id, code: x.code, name: x.name }))));
  }
}
