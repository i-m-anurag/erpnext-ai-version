import { configResolver } from '../config/index.js';
import { NotFoundError } from '../../shared/errors.js';
import { FORM_RESOURCE_TYPE } from './form.resource.js';
import type { FormDefinition } from './form.schema.js';
import type { EffectiveResource } from '../config/index.js';

/** Read access to resolved (base+override) form definitions. */
export class FormService {
  getForm(slug: string): Promise<EffectiveResource<FormDefinition>> {
    return configResolver.resolve<FormDefinition>(FORM_RESOURCE_TYPE, slug);
  }

  /**
   * Resolve a form only if it is flagged `public`. Non-public (or missing) forms
   * throw NotFound — deliberately indistinguishable, so the unauthenticated
   * endpoint never reveals which private forms exist.
   */
  async getPublicForm(slug: string): Promise<EffectiveResource<FormDefinition>> {
    let eff: EffectiveResource<FormDefinition>;
    try {
      eff = await this.getForm(slug);
    } catch {
      throw new NotFoundError('Form not found');
    }
    if (!eff.definition.public) throw new NotFoundError('Form not found');
    return eff;
  }
}

export const formService = new FormService();
